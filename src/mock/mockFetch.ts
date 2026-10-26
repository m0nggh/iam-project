import { randomUUID } from 'node:crypto';
import type { GraphGroup } from '../types/graph';
import fixturesJson from './fixtures/graph-groups.json';

interface MockFixtures {
  /** Each inner array is one page, so mock mode exercises @odata.nextLink paging too. */
  groupPages: GraphGroup[][];
}

const fixtures: MockFixtures = fixturesJson;

const MOCK_ERROR_CODES: Record<number, string> = {
  401: 'InvalidAuthenticationToken',
  403: 'Authorization_RequestDenied',
  429: 'TooManyRequests',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': `mock-${randomUUID()}`, ...headers },
  });
}

/**
 * A drop-in replacement for `fetch` that answers like Microsoft Graph from fixture data.
 * Only the network boundary is faked: the real graphService still builds the requests,
 * follows paging, retries and maps errors.
 */
export function createMockFetch({ failWith = null }: { failWith?: number | null } = {}): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);

    if (failWith) {
      return jsonResponse(
        failWith,
        {
          error: {
            code: MOCK_ERROR_CODES[failWith] ?? 'MockFailure',
            message: `Simulated Graph failure (MOCK_GRAPH_FAIL=${failWith})`,
          },
        },
        failWith === 429 ? { 'Retry-After': '1' } : {},
      );
    }

    if (url.pathname.endsWith('/groups')) {
      const pageIndex = Number(url.searchParams.get('$skiptoken') ?? 0);
      const body: Record<string, unknown> = { value: fixtures.groupPages[pageIndex] ?? [] };
      if (pageIndex + 1 < fixtures.groupPages.length) {
        body['@odata.nextLink'] = `${url.origin}${url.pathname}?$skiptoken=${pageIndex + 1}`;
      }
      return jsonResponse(200, body);
    }

    return jsonResponse(404, {
      error: { code: 'Request_UnsupportedQuery', message: `Mock has no route for ${url.pathname}` },
    });
  };
}
