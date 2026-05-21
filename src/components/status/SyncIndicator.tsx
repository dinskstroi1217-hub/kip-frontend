import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Маленький инлайн-индикатор синхронизации.
 * Удобен для шапок страниц / карточек, где плашка OfflineBanner избыточна.
 */
export function SyncIndicator() {
  const online = useOnlineStatus();
  const { total } = useSyncStatus();
  if (online && total === 0) return null;

  return (
    <span
      className={
        online
          ? 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900'
          : 'inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900'
      }
    >
      {online ? `↑ ${total}` : '● оффлайн'}
    </span>
  );
}
