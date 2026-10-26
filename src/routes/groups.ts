import { Router } from 'express';
import { AppError } from '../errors';
import { SecurityGroup } from '../models/SecurityGroup';
import type { SyncService } from '../services/syncService';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Express 5 forwards rejected promises from async handlers to the error handler, so no try/catch here.
export function createGroupsRouter({ syncService }: { syncService: SyncService }): Router {
  const router = Router();

  /** Pull security groups from Microsoft Graph and upsert them into MongoDB. */
  router.post('/sync', async (req, res) => {
    const summary = await syncService.run();
    req.log.info({ summary }, 'Security group sync completed');
    res.json(summary);
  });

  /** List stored security groups, alphabetically. */
  router.get('/groups', async (_req, res) => {
    const groups = await SecurityGroup.find({}, { _id: 0 }).sort({ displayName: 1 }).lean();
    res.json({ count: groups.length, groups });
  });

  /** One stored security group by its Entra object id. */
  router.get('/groups/:groupId', async (req, res) => {
    const { groupId } = req.params;
    if (!GUID_RE.test(groupId)) {
      throw new AppError('groupId must be a GUID', { status: 400, code: 'INVALID_GROUP_ID' });
    }
    const group = await SecurityGroup.findOne({ groupId }, { _id: 0 }).lean();
    if (!group) {
      throw new AppError(`Security group ${groupId} not found (has POST /api/sync been run?)`, {
        status: 404,
        code: 'GROUP_NOT_FOUND',
      });
    }
    res.json(group);
  });

  return router;
}
