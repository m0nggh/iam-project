import { createTokenProvider } from '../auth/graphAuth';
import type { AppConfig } from '../config';
import { createMockFetch } from '../mock/mockFetch';
import type { GraphClient } from '../types/graph';
import { createGraphService } from './graphService';

/**
 * Picks the Graph backend for the configured mode. Both return the same GraphClient,
 * so nothing downstream (sync, MongoDB, API) knows or cares which one it got.
 */
export function createGraphClient(config: AppConfig): GraphClient {
  if (config.graphMode === 'mock') {
    return createGraphService({
      getToken: async () => 'mock-token',
      fetchImpl: createMockFetch({ failWith: config.mockGraphFail }),
    });
  }

  if (!config.azure) throw new Error('GRAPH_MODE=live requires Azure credentials');
  return createGraphService({ getToken: createTokenProvider(config.azure) });
}
