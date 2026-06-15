import { db } from './db';
import { newId } from '@/lib/uuid';
import type { SerializedRequestBody, SyncOperation, SyncQueueItem } from '@/types/sync';

/**
 * Outbox API. Используется фичами (через submitOrQueue) для постановки мутаций
 * в очередь, когда нет связи.
 *
 * Принцип:
 *   1. submitOrQueue пробует онлайн; при сетевой ошибке вызывает enqueue(...) —
 *      мутация уходит в IndexedDB как pending (вместе с фото-Blob, если multipart).
 *   2. sync.ts периодически забирает pending → отправляет → помечает done/failed.
 *   3. UI подписывается на счётчик pending (см. hooks/useSyncStatus).
 */

export interface EnqueueArgs {
  /** Явный id = Idempotency-Key. Передаём тот же ключ, что пробовали онлайн,
   *  чтобы повтор из очереди не создал дубль (если бэк учитывает ключ). */
  id?: string;
  op: SyncOperation;
  url: string;
  body: SerializedRequestBody;
  entityType?: SyncQueueItem['entityType'];
  entityId?: string;
}

export async function enqueue(args: EnqueueArgs): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: args.id ?? newId(),
    op: args.op,
    url: args.url,
    body: args.body,
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
