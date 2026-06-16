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
 *   - триггеры: online / открытие / возврат из фона / таймер / ручная кнопка.
 *   - backoff: 30s → 2m → 5m → 15m (с лёгким jitter ±25%, см. nextAttempt()).
 *   - классификация ошибок (КЛЮЧЕВОЕ для не-потери данных):
 *       • транзиентные (нет связи, 408, 429, 5xx) → остаёмся 'pending' с backoff,
 *         НЕ сдаёмся никогда — данные дойдут, когда вернётся связь/сервер;
 *       • терминальные (4xx кроме 408/429, включая 409-конфликт) → 'failed':
 *         данные как есть сервер не примет, нужно вмешательство → показываем в UI.
 *   - идемпотентность — id записи = Idempotency-Key (бэк ДОЛЖЕН его учитывать;
 *     это внешняя зависимость, см. submit.ts).
 *   - attempts считаем только по ФАКТУ ответа (в catch), не при пометке in_flight,
 *     иначе обрыв посреди отправки сжигал бы попытки без ответа сервера.
 */

const BACKOFFS_MS = [30_000, 120_000, 300_000, 900_000];

/** Таймаут одной попытки дренажа. Дольше онлайн-попытки (submit.ts, 15s),
 *  т.к. повтор из очереди часто несёт multipart с несколькими фото. */
const DRAIN_ATTEMPT_TIMEOUT_MS = 30_000;

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
      // Реклейм «застрявших» in_flight: их статус выставляется ПЕРЕД отправкой,
      // и если предыдущий прогон умер (приложение свернули/убили/перезагрузка)
      // до подтверждения — элемент навсегда выпал бы из listPending (потеря!).
      // runSync single-flight (runningPromise), поэтому сейчас активных нет —
      // любой in_flight это недоставленный остаток, возвращаем в очередь.
      const stuck = await db.outbox.where('status').equals('in_flight').toArray();
      for (const s of stuck) await markStatus(s.id, 'pending');

      const items = await listPending();
      const now = Date.now();
      for (const item of items) {
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;
        // attempts НЕ инкрементим здесь — попыткой считается только завершённый
        // запрос (получивший HTTP-ответ). Иначе обрыв/убийство посреди upload
        // сжигал бы попытки без ответа сервера.
        await markStatus(item.id, 'in_flight', { lastAttemptAt: now });
        // Таймаут на дренаж-запрос: без него зависший upload (multipart с фото
        // на флакки-связи) держал бы item в in_flight и блокировал весь FIFO.
        // По таймауту прерываем → ApiError.isNetwork → остаёмся 'pending' (не теряем).
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DRAIN_ATTEMPT_TIMEOUT_MS);
        try {
          // Content-Type не выставляем: для multipart его проставит браузер
          // (boundary), для json — apiClient. id записи = Idempotency-Key.
          await apiClient.request(item.url, {
            method: item.op,
            ...buildRequestBody(item.body),
            headers: { 'Idempotency-Key': item.id },
            signal: controller.signal,
          });
          // Успех — убираем из очереди, чтобы не копилась на устройстве.
          await db.outbox.delete(item.id);
        } catch (err) {
          const attempts = item.attempts + 1;
          const status = err instanceof ApiError ? err.status : 0;
          // Терминально: 4xx (данные сервер не примет как есть), КРОМЕ транзиентных
          // 408/429 и ВОССТАНОВИМЫХ 401/403 (истёкший/протухший токен после возврата
          // в сеть — держим в очереди, дошлём после повторного входа; иначе запись
          // падала бы в 'failed' и выпадала из автодренажа = тихая потеря).
          // 409-конфликт остаётся терминальным («обновите экран»). Транзиентно:
          // нет связи=0, 401, 403, 408, 429, 5xx — держим с backoff, не теряем.
          const terminal =
            err instanceof ApiError &&
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429 &&
            status !== 401 &&
            status !== 403;
          await markStatus(item.id, terminal ? 'failed' : 'pending', {
            attempts,
            lastError: err instanceof Error ? err.message : String(err),
            ...(terminal ? {} : { nextAttemptAt: nextAttempt(item.attempts) }),
          });
        } finally {
          clearTimeout(timer);
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
let triggersInstalled = false;

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
  // Защита от дублей слушателей/таймера (StrictMode двойной mount, ремоунт).
  if (triggersInstalled) return;
  triggersInstalled = true;

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
