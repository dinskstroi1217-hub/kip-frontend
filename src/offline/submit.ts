import { apiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { newId } from '@/lib/uuid';
import { enqueue } from './queue';
import { runSync } from './sync';
import type { SerializedRequestBody, SyncOperation, SyncQueueItem } from '@/types/sync';

/**
 * submitOrQueue — единая точка отправки driver-мутаций.
 *
 * Логика:
 *   1. Пробуем отправить онлайн (с заранее сгенерированным Idempotency-Key).
 *   2. Если сетевая ошибка (нет связи, ApiError.isNetwork) — кладём мутацию в
 *      outbox (вместе с фото-Blob, если multipart) и возвращаем queued=true.
 *      sync.ts дошлёт её, когда появится связь.
 *   3. Любая НЕ-сетевая ошибка (400/403/409/500…) — пробрасывается наверх:
 *      это не «нет связи», очередь не поможет, пусть UI покажет ошибку.
 *
 * Idempotency-Key один и тот же для онлайн-попытки и для повтора из очереди
 * (= queuedId = id записи outbox) → при дошлёте бэк, если учитывает ключ, не
 * создаст дубль. (Учёт ключа бэком — зона диспетчер-сессии, надо подтвердить.)
 */

export interface SubmitOrQueueOpts {
  url: string;
  method: SyncOperation;
  /** JSON-тело (для не-multipart мутаций). Игнорируется, если задан formData. */
  json?: unknown;
  /** Multipart-тело (мутации с фото). Имеет приоритет над json. */
  formData?: FormData;
  entityType?: SyncQueueItem['entityType'];
  entityId?: string;
}

export interface SubmitResult<T> {
  /** Ответ сервера при онлайн-отправке; null — если ушло в очередь. */
  result: T | null;
  /** true → нет связи, мутация в очереди (UI показывает «сохранено, отправится позже»). */
  queued: boolean;
  /** Idempotency-Key = id записи outbox. Использовать для оптимистичного локального объекта. */
  queuedId: string;
}

function serializeBody(opts: SubmitOrQueueOpts): SerializedRequestBody {
  if (opts.formData) {
    const fields: [string, string][] = [];
    const files: { field: string; blob: Blob; filename: string }[] = [];
    opts.formData.forEach((value, key) => {
      if (typeof value === 'string') {
        fields.push([key, value]);
      } else {
        files.push({ field: key, blob: value, filename: (value as File).name || `${key}.bin` });
      }
    });
    return { kind: 'multipart', fields, files };
  }
  if (opts.json !== undefined) return { kind: 'json', data: opts.json };
  return { kind: 'none' };
}

export async function submitOrQueue<T>(opts: SubmitOrQueueOpts): Promise<SubmitResult<T>> {
  const queuedId = newId();
  try {
    const result = await apiClient.request<T>(opts.url, {
      method: opts.method,
      ...(opts.formData ? { formData: opts.formData } : { body: opts.json }),
      headers: { 'Idempotency-Key': queuedId },
    });
    return { result, queued: false, queuedId };
  } catch (e) {
    if (e instanceof ApiError && e.isNetwork) {
      await enqueue({
        id: queuedId,
        op: opts.method,
        url: opts.url,
        body: serializeBody(opts),
        entityType: opts.entityType,
        entityId: opts.entityId,
      });
      // Связь могла мигнуть — пробуем сразу, результат не важен.
      void runSync();
      return { result: null, queued: true, queuedId };
    }
    throw e;
  }
}
