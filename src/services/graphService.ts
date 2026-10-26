import type { TokenProvider } from '../auth/graphAuth';
import { GraphApiError } from '../errors';
import type { GraphClient, GraphCollection, GraphErrorBody, GraphGroup } from '../types/graph';

const GROUP_FIELDS = [
  'id',
  'displayName',
  'description',
  'createdDateTime',
  'securityEnabled',
  'mailEnabled',
  'groupTypes',
  'membershipRule',
].join(',');
// Security groups are security-enabled and not mail-enabled (that excludes M365 groups and distribution lists).
const SECURITY_GROUP_FILTER = 'securityEnabled eq true and mailEnabled eq false';
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 10_000;

// 429 = throttled, 503/504 = transient Graph outage. Everything else is not worth retrying.
const RETRYABLE_STATUS = new Set([429, 503, 504]);
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 30_000;

interface ErrorMapping {
  status: number;
  code: string;
  message: string;
}

/**
 * How Graph's status codes become *our* API's status codes. Only the ones we expect from
 * GET /groups get a specific code; anything else falls back to a generic 502 GRAPH_ERROR.
 * A Graph 401 is not the caller's fault, so we answer 502 Bad Gateway (an upstream dependency failed), not 401.
 */
const ERROR_MAP: Record<number, ErrorMapping> = {
  401: {
    status: 502,
    code: 'GRAPH_UNAUTHORIZED',
    message: 'Microsoft Graph rejected the access token (check TENANT_ID, CLIENT_ID and CLIENT_SECRET)',
  },
  403: {
    status: 502,
    code: 'GRAPH_FORBIDDEN',
    message: 'The app lacks Graph permissions (check Group.Read.All and that admin consent was granted)',
  },
  429: { status: 503, code: 'GRAPH_THROTTLED', message: 'Microsoft Graph is throttling requests, try again later' },
};

export interface GraphServiceOptions {
  getToken: TokenProvider;
  /** Swapped for a fake in mock mode and in tests; the real `fetch` otherwise. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff: 0.5s, 1s, 2s, 4s … capped at 8s. */
const backoff = (attempt: number) => Math.min(500 * 2 ** attempt, 8000);

/** Graph tells us how long to wait on 429 via Retry-After (seconds); fall back to backoff otherwise. */
function retryDelay(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  return retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS) : backoff(attempt);
}

async function toGraphError(res: Response): Promise<GraphApiError> {
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody;
  const mapped = ERROR_MAP[res.status] ?? {
    status: 502,
    code: 'GRAPH_ERROR',
    message: `Microsoft Graph returned HTTP ${res.status}`,
  };
  const graphMessage = body.error?.message;

  return new GraphApiError(graphMessage ? `${mapped.message}: ${graphMessage}` : mapped.message, {
    status: mapped.status,
    code: mapped.code,
    graphStatus: res.status,
    graphCode: body.error?.code,
    graphRequestId: res.headers.get('request-id') ?? undefined,
  });
}

export function createGraphService({ getToken, fetchImpl = fetch }: GraphServiceOptions): GraphClient {
  /** GET a Graph URL, retrying transient failures, and turn any failure into a GraphApiError. */
  async function request<T>(url: string): Promise<T> {
    const token = await getToken();

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // Network error or our own timeout fired – retry, then give up.
        if (attempt < MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        throw new GraphApiError(
          timedOut ? `Microsoft Graph did not respond within ${TIMEOUT_MS} ms` : 'Could not reach Microsoft Graph',
          { status: timedOut ? 504 : 502, code: timedOut ? 'GRAPH_TIMEOUT' : 'GRAPH_UNREACHABLE', cause: err },
        );
      }

      if (res.ok) return (await res.json()) as T;

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(retryDelay(res, attempt));
        continue;
      }

      throw await toGraphError(res);
    }
  }

  /** Graph returns at most one page per call; keep following @odata.nextLink until there is none. */
  async function getAll<T>(pathAndQuery: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined = `${GRAPH_BASE_URL}${pathAndQuery}`;
    while (url) {
      const page: GraphCollection<T> = await request<GraphCollection<T>>(url);
      items.push(...page.value);
      url = page['@odata.nextLink'];
    }
    return items;
  }

  return {
    listSecurityGroups: () =>
      getAll<GraphGroup>(
        `/groups?$filter=${encodeURIComponent(SECURITY_GROUP_FILTER)}&$select=${GROUP_FIELDS}&$top=${PAGE_SIZE}`,
      ),
  };
}
