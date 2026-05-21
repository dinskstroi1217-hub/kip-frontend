import { v7 as uuidv7 } from 'uuid';

/**
 * UUIDv7 — хронологически сортируемый ID.
 * Используется для Idempotency-Key и для локальных черновиков
 * (на момент создания у нас ещё нет серверного id, но порядок известен).
 */
export function newId(): string {
  return uuidv7();
}
