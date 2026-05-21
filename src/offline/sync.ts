import { apiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { db } from './db';
import { listPending, markStatus } from './queue';

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
          await apiClient.request(item.url, {
            method: item.op,
            body: item.body,
            headers: {
              'Idempotency-Key': item.id,
              ...(item.contentType ? { 'Content-Type': item.contentType } : {}),
            },
          });
          await markStatus(item.id, 'done');
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

/**
 * Подключаем триггеры: online + page-load. Кнопка ручного запуска — в UI.
 */
export function installSyncTriggers(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    void runSync();
  });
  // Стартовый пинок — на случай если очередь не пуста при открытии
  void runSync();
}

/**
 * Очистка очереди (после ручного разрешения failed). Не используется в MVP UI.
 */
export async function clearFailed(): Promise<void> {
  await db.outbox.where('status').equals('failed').delete();
}
