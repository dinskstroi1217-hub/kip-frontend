import { apiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { db } from './db';
import { listPending, markStatus } from './queue';
import type { RequestOptions } from '@/api/client';
import type { SerializedRequestBody } from '@/types/sync';

/**
 * Восстанавливает тело запроса из сериализованного вида (см. submitOrQueue).
 * multipart → пересобираем FormData с Blob-файлами; json → как есть.
 */
function buildRequestBody(body: SerializedRequestBody | undefined): Pick<RequestOptions, 'body' | 'formData'> {
  if (!body || body.kind === 'none') return {};
  if (body.kind === 'json') return { body: body.data };
  const fd = new FormData();
  for (const [k, v] of body.fields) fd.append(k, v);
  for (const f of body.files) fd.append(f.field, f.blob, f.filename);
  return { formData: fd };
}

/**
 * Цикл синхронизации.
 *
 * MVP:
 *   - триггеры запуска: событие `online`, открытие приложения, ручная кнопка.
 *   - backoff: 30s → 2m → 5m → 15m (с лёгким jitter ±25%, см. nextAttempt()).
 *   - максимум 5 попыток, потом status='failed' (требует ручного разрешения).
 *   - идемпотентность — id записи становится Idempotency-Key (см. api/client).
 *
 * Не делаем conflict-engine: при 409 помечаем failed и просим обновить экран.
 */

const BACKOFFS_MS = [30_000, 120_000, 300_000, 900_000];
const MAX_ATTEMPTS = 5;

function nextAttempt(attempts: number): number {
  const base = BACKOFFS_MS[Math.min(attempts, BACKOFFS_MS.length - 1)] ?? 900_000;
  const jitter = base * (0.75 + Math.random() * 0.5); // ±25%
  return Date.now() + jitter;
}

let runningPromise: Promise<void> | null = null;

export function runSync(): Promise<void> {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    try {
      const items = await listPending();
      const now = Date.now();
      for (const item of items) {
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;
        await markStatus(item.id, 'in_flight', { lastAttemptAt: now, attempts: item.attempts + 1 });
        try {
          // Content-Type не выставляем: для multipart его проставит браузер
          // (boundary), для json — apiClient. id записи = Idempotency-Key.
          await apiClient.request(item.url, {
            method: item.op,
            ...buildRequestBody(item.body),
            headers: { 'Idempotency-Key': item.id },
          });
          // Успех — убираем из очереди, чтобы не копилась на устройстве.
          await db.outbox.delete(item.id);
        } catch (err) {
          const isClient = err instanceof ApiError && err.status >= 400 && err.status < 500;
          const conflict = err instanceof ApiError && err.status === 409;
          const failedTerminal =
            isClient && !conflict /* клиентские ошибки кроме 409 — терминальные */;
          const exhausted = item.attempts + 1 >= MAX_ATTEMPTS;
          await markStatus(item.id, failedTerminal || exhausted ? 'failed' : 'pending', {
            lastError: err instanceof Error ? err.message : String(err),
            nextAttemptAt: nextAttempt(item.attempts),
          });
        }
      }
    } finally {
      runningPromise = null;
    }
  })();
  return runningPromise;
}

const PERIODIC_SYNC_MS = 60_000; // дренаж очереди раз в минуту, пока приложение открыто
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Подключаем триггеры дренажа очереди:
 *   - возврат сети (online)
 *   - открытие приложения (стартовый пинок)
 *   - возврат приложения из фона (visibilitychange) — частый кейс на телефоне
 *   - периодический таймер раз в минуту (на случай мерцающей связи без события online)
 * Ручная кнопка «отправить сейчас» — в UI (вызывает runSync()).
 */
export function installSyncTriggers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    void runSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync();
  });

  if (periodicTimer === null) {
    periodicTimer = setInterval(() => {
      // navigator.onLine=false → точно нет смысла дёргать; иначе пробуем
      if (typeof navigator === 'undefined' || navigator.onLine) void runSync();
    }, PERIODIC_SYNC_MS);
  }

  // Стартовый пинок — на случай если очередь не пуста при открытии
  void runSync();
}

/**
 * Очистка очереди (после ручного разрешения failed). Не используется в MVP UI.
 */
export async function clearFailed(): Promise<void> {
  await db.outbox.where('status').equals('failed').delete();
}
