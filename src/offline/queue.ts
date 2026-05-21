import { db } from './db';
import { newId } from '@/lib/uuid';
import type { SyncOperation, SyncQueueItem } from '@/types/sync';

/**
 * Outbox API. Используется фичами для постановки мутаций в очередь.
 *
 * Принцип:
 *   1. Фича вызывает enqueue(...) — мутация уходит в IndexedDB как pending.
 *   2. sync.ts периодически забирает pending → отправляет → помечает done/failed.
 *   3. UI подписывается на счётчик pending (см. hooks/useSyncStatus).
 *
 * Для MVP: enqueue/list/markStatus — этого достаточно. Сам цикл sync — в sync.ts.
 */

export interface EnqueueArgs {
  op: SyncOperation;
  url: string;
  body?: unknown;
  contentType?: string;
  entityType?: SyncQueueItem['entityType'];
  entityId?: string;
}

export async function enqueue(args: EnqueueArgs): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newId(),
    op: args.op,
    url: args.url,
    body: args.body,
    contentType: args.contentType ?? 'application/json',
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    entityType: args.entityType,
    entityId: args.entityId,
  };
  await db.outbox.add(item);
  return item;
}

export async function countPending(): Promise<number> {
  return db.outbox.where('status').anyOf('pending', 'failed', 'in_flight').count();
}

export async function listPending(): Promise<SyncQueueItem[]> {
  return db.outbox.where('status').anyOf('pending', 'failed').sortBy('createdAt');
}

export async function markStatus(
  id: string,
  status: SyncQueueItem['status'],
  patch: Partial<SyncQueueItem> = {},
): Promise<void> {
  await db.outbox.update(id, { status, ...patch });
}
