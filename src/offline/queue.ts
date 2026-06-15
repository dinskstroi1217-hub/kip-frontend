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

/** «Ждут отправки» — будут досланы автоматически (сеть/сервер вернутся). */
export async function countPending(): Promise<number> {
  return db.outbox.where('status').anyOf('pending', 'in_flight').count();
}

/** «Не удалось отправить» — терминальный отказ сервера, нужно вмешательство. */
export async function countFailed(): Promise<number> {
  return db.outbox.where('status').equals('failed').count();
}

/** Для дренажа берём ТОЛЬКО pending. failed исключён (иначе ретраился бы вечно);
 *  in_flight реклеймится в pending в начале runSync.
 *  Сортировка: createdAt, тай-брейк по id (UUIDv7 монотонный). Тай-брейк
 *  критичен: две мутации в один тик (напр. акт сдачи + complete при закрытии
 *  смены) должны дренироваться строго в порядке постановки, иначе complete
 *  уйдёт раньше акта → вахта закрыта → акт ловит 409 → потеря акта сдачи. */
export async function listPending(): Promise<SyncQueueItem[]> {
  const items = await db.outbox.where('status').equals('pending').toArray();
  return items.sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export async function listFailed(): Promise<SyncQueueItem[]> {
  return db.outbox.where('status').equals('failed').sortBy('createdAt');
}

/** Ручной повтор: вернуть failed в очередь (без id — все). nextAttemptAt=0 → сразу. */
export async function retryFailed(id?: string): Promise<void> {
  if (id) {
    await markStatus(id, 'pending', { nextAttemptAt: 0 });
    return;
  }
  const failed = await db.outbox.where('status').equals('failed').toArray();
  for (const f of failed) await markStatus(f.id, 'pending', { nextAttemptAt: 0 });
}

export async function markStatus(
  id: string,
  status: SyncQueueItem['status'],
  patch: Partial<SyncQueueItem> = {},
): Promise<void> {
  await db.outbox.update(id, { status, ...patch });
}
