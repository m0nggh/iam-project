import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { GraphMode } from './config';
import { isConnected } from './db';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createGroupsRouter } from './routes/groups';
import type { SyncService } from './services/syncService';

export interface AppDeps {
  syncService: SyncService;
  logger: Logger;
  graphMode: GraphMode;
}

/** Builds the Express app; server.ts wires in the real dependencies and starts listening. */
export function createApp({ syncService, logger, graphMode }: AppDeps): Express {
  const app = express();

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      // Every request gets an id that appears in the logs and in error responses, so a failure
      // reported by a caller can be found in the logs.
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );

  app.get('/health', (_req, res) => {
    const dbUp = isConnected();
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'connected' : 'disconnected',
      graphMode,
    });
  });

  app.use('/api', createGroupsRouter({ syncService }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
