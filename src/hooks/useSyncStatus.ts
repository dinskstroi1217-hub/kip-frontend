import { useLiveQuery } from 'dexie-react-hooks';
import { countPending, countFailed } from '@/offline/queue';
import { countPendingPhotos } from '@/offline/photos';

export interface SyncStatusSummary {
  /** Ждут отправки (досылаются автоматически). */
  pendingOps: number;
  pendingPhotos: number;
  /** Не удалось отправить (терминальный отказ — нужно вмешательство). */
  failedOps: number;
  /** Сумма «ждут отправки» (для индикатора). */
  total: number;
}

/**
 * Реактивный счётчик незавершённых синхронизаций.
 * dexie-react-hooks ловит изменения IndexedDB и ре-рендерит подписчика.
 */
export function useSyncStatus(): SyncStatusSummary {
  const pendingOps = useLiveQuery(() => countPending(), [], 0);
  const pendingPhotos = useLiveQuery(() => countPendingPhotos(), [], 0);
  const failedOps = useLiveQuery(() => countFailed(), [], 0);
  return {
    pendingOps: pendingOps ?? 0,
    pendingPhotos: pendingPhotos ?? 0,
    failedOps: failedOps ?? 0,
    total: (pendingOps ?? 0) + (pendingPhotos ?? 0),
  };
}
