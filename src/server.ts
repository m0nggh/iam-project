import { createApp } from './app';
import { loadConfig } from './config';
import * as db from './db';
import { createLogger } from './logger';
import { createGraphClient } from './services/graphClientFactory';
import { createSyncService } from './services/syncService';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  await db.connect(config.mongoUri);
  logger.info('Connected to MongoDB');

  const syncService = createSyncService({ graph: createGraphClient(config) });
  const app = createApp({ syncService, logger, graphMode: config.graphMode });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, graphMode: config.graphMode }, 'IAM group sync API listening');
  });

  // Docker sends SIGTERM on `docker stop`: finish in-flight requests, close Mongo, then exit.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await db.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
