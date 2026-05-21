import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';

/**
 * Постоянная плашка в верхней части приложения.
 *
 * Показывает:
 *   - "Офлайн" — нет сети
 *   - "N изменений ждут отправки" — онлайн, но в очереди что-то есть
 *   - ничего (null) — всё ок
 *
 * UX-правило ТЗ: офлайн-статус всегда виден.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const sync = useSyncStatus();

  if (online && sync.total === 0) return null;

  const offline = !online;
  const pending = sync.total;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        offline
          ? 'sticky top-0 z-40 w-full bg-red-600 px-4 py-2 text-center text-sm font-medium text-white'
          : 'sticky top-0 z-40 w-full bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white'
      }
    >
      {offline ? (
        <>
          <span aria-hidden>● </span>Офлайн
          {pending > 0 && ` · ${pending} изменений в очереди`}
        </>
      ) : (
        <>
          <span aria-hidden>↑ </span>
          {pending} {pluralizeChanges(pending)} ждут отправки
        </>
      )}
    </div>
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
