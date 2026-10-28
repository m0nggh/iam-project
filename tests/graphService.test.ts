import { describe, expect, it, vi } from 'vitest';
import { createGraphService } from '../src/services/graphService';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A graph service whose fetch returns the given responses in order – no network, no Azure. */
function setup(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift()!);
  const graph = createGraphService({
    getToken: async () => 'test-token',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { graph, fetchImpl };
}

describe('graphService.listSecurityGroups', () => {
  it('sends the bearer token and filters to security groups', async () => {
    const { graph, fetchImpl } = setup([json(200, { value: [] })]);
    await graph.listSecurityGroups();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(decodeURIComponent(url)).toContain('$filter=securityEnabled eq true and mailEnabled eq false');
  });

  it('follows @odata.nextLink to read every page', async () => {
    const { graph } = setup([
      json(200, { value: [{ id: 'a' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/groups?$skiptoken=1' }),
      json(200, { value: [{ id: 'b' }] }),
    ]);

    const groups = await graph.listSecurityGroups();
    expect(groups.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('turns a Graph 401 into a 502 GRAPH_UNAUTHORIZED error', async () => {
    const { graph } = setup([json(401, { error: { code: 'InvalidAuthenticationToken', message: 'Token expired' } })]);

    await expect(graph.listSecurityGroups()).rejects.toMatchObject({ status: 502, code: 'GRAPH_UNAUTHORIZED' });
  });
});
