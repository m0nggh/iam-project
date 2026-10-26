import type { AnyBulkWriteOperation } from 'mongoose';
import { AppError } from '../errors';
import { SecurityGroup, type SecurityGroupRecord } from '../models/SecurityGroup';
import type { GraphClient, GraphGroup } from '../types/graph';

export interface SyncSummary {
  /** Security groups returned by Graph. */
  fetched: number;
  /** New documents inserted. */
  created: number;
  /** Existing documents refreshed. */
  updated: number;
  /** Documents deleted because the group no longer exists in Entra ID. */
  removed: number;
  durationMs: number;
}

export interface SyncService {
  run(): Promise<SyncSummary>;
}

function toRecord(group: GraphGroup, syncedAt: Date): SecurityGroupRecord {
  return {
    groupId: group.id,
    displayName: group.displayName,
    description: group.description ?? null,
    securityEnabled: group.securityEnabled,
    mailEnabled: group.mailEnabled,
    groupTypes: group.groupTypes ?? [],
    membershipRule: group.membershipRule ?? null,
    createdDateTime: group.createdDateTime ? new Date(group.createdDateTime) : null,
    lastSyncedAt: syncedAt,
  };
}

export function createSyncService({ graph }: { graph: GraphClient }): SyncService {
  let running = false;

  async function sync(): Promise<SyncSummary> {
    const startedAt = new Date();
    const groups = await graph.listSecurityGroups();

    // Upsert keyed on the Entra object id: re-running the sync never creates duplicates (idempotent).
    const ops: AnyBulkWriteOperation<SecurityGroupRecord>[] = groups.map((group) => ({
      updateOne: {
        filter: { groupId: group.id },
        update: { $set: toRecord(group, startedAt) },
        upsert: true,
      },
    }));
    const result = ops.length ? await SecurityGroup.bulkWrite(ops, { ordered: false }) : null;

    // Anything not touched by this run was deleted in Entra ID. Only reached if Graph fully succeeded.
    const { deletedCount } = await SecurityGroup.deleteMany({ lastSyncedAt: { $lt: startedAt } });

    return {
      fetched: groups.length,
      created: result?.upsertedCount ?? 0,
      updated: result?.matchedCount ?? 0,
      removed: deletedCount,
      durationMs: Date.now() - startedAt.getTime(),
    };
  }

  return {
    async run() {
      if (running) {
        throw new AppError('A sync is already in progress', { status: 409, code: 'SYNC_IN_PROGRESS' });
      }
      running = true;
      try {
        return await sync();
      } finally {
        running = false;
      }
    },
  };
}
