import { useLiveQuery } from 'dexie-react-hooks';
import { countPending } from '@/offline/queue';
import { countPendingPhotos } from '@/offline/photos';

export interface SyncStatusSummary {
  pendingOps: number;
  pendingPhotos: number;
  total: number;
}

/**
 * Реактивный счётчик незавершённых синхронизаций.
 * dexie-react-hooks ловит изменения IndexedDB и ре-рендерит подписчика.
 */
export function useSyncStatus(): SyncStatusSummary {
  const pendingOps = useLiveQuery(() => countPending(), [], 0);
  const pendingPhotos = useLiveQuery(() => countPendingPhotos(), [], 0);
  return {
    pendingOps: pendingOps ?? 0,
    pendingPhotos: pendingPhotos ?? 0,
    total: (pendingOps ?? 0) + (pendingPhotos ?? 0),
  };
}
