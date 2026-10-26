import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type GraphMode = 'live' | 'mock';

export interface AzureCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  logLevel: string;
  graphMode: GraphMode;
  /** Mock mode only: HTTP status the fake Graph should fail with (e.g. 401, 429). */
  mockGraphFail: number | null;
  /** Present only in live mode. */
  azure: AzureCredentials | null;
}

const LIVE_REQUIRED = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET'] as const;

/**
 * Reads configuration from environment variables and fails fast on anything invalid.
 *
 * GRAPH_MODE decides where group data comes from:
 *   live – real Microsoft Graph (needs TENANT_ID / CLIENT_ID / CLIENT_SECRET)
 *   mock – bundled fixture data, no Azure account needed
 * When GRAPH_MODE is unset we default to live if a TENANT_ID is present, otherwise mock.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const graphMode = (env.GRAPH_MODE || (env.TENANT_ID ? 'live' : 'mock')).trim().toLowerCase();
  if (graphMode !== 'live' && graphMode !== 'mock') {
    throw new Error(`GRAPH_MODE must be "live" or "mock" (got "${env.GRAPH_MODE}")`);
  }

  let azure: AzureCredentials | null = null;
  if (graphMode === 'live') {
    const missing = LIVE_REQUIRED.filter((key) => !env[key]);
    if (missing.length) {
      throw new Error(`Missing required environment variables for GRAPH_MODE=live: ${missing.join(', ')}`);
    }
    azure = { tenantId: env.TENANT_ID!, clientId: env.CLIENT_ID!, clientSecret: env.CLIENT_SECRET! };
  }

  return {
    port: Number(env.PORT) || 3000,
    // Default = the MongoDB container from `npm run setup` (see docker-compose.yml for why 127.0.0.1:27018).
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27018/iam',
    logLevel: env.LOG_LEVEL || 'info',
    graphMode,
    mockGraphFail: env.MOCK_GRAPH_FAIL ? Number(env.MOCK_GRAPH_FAIL) : null,
    azure,
  };
}
