import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { retryFailed } from '@/offline/queue';
import { runSync } from '@/offline/sync';

/**
 * Постоянная плашка в верхней части приложения.
 *
 * Показывает (по приоритету):
 *   - "M не отправлено · Повторить" — терминальный отказ сервера (нужно действие)
 *   - "Офлайн" — нет сети
 *   - "N изменений ждут отправки" — онлайн, но в очереди что-то есть
 *   - ничего (null) — всё ок
 *
 * UX-правило ТЗ: офлайн-статус всегда виден.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const sync = useSyncStatus();

  const offline = !online;
  const pending = sync.total;
  const failed = sync.failedOps;

  if (!offline && pending === 0 && failed === 0) return null;

  return (
    <>
      {failed > 0 && (
        <div
          role="alert"
          className="sticky top-0 z-40 w-full bg-red-700 px-4 py-2 text-center text-sm font-medium text-white"
        >
          <span aria-hidden>⚠ </span>
          {failed} {pluralizeChanges(failed)} не отправлено
          <button
            type="button"
            onClick={() => {
              void retryFailed().then(() => runSync());
            }}
            className="ml-2 rounded bg-white/20 px-2 py-0.5 underline underline-offset-2 hover:bg-white/30"
          >
            Повторить
          </button>
        </div>
      )}

      {offline ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-40 w-full bg-red-600 px-4 py-2 text-center text-sm font-medium text-white"
        >
          <span aria-hidden>● </span>Офлайн
          {pending > 0 && ` · ${pending} ${pluralizeChanges(pending)} в очереди`}
        </div>
      ) : pending > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-40 w-full bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white"
        >
          <span aria-hidden>↑ </span>
          {pending} {pluralizeChanges(pending)} ждут отправки
        </div>
      ) : null}
    </>
  );
}

function pluralizeChanges(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'изменений';
  if (mod10 === 1) return 'изменение';
  if (mod10 >= 2 && mod10 <= 4) return 'изменения';
  return 'изменений';
}
