import { useEffect, type ReactNode } from 'react';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/features/auth/store';
import { installSyncTriggers } from '@/offline/sync';
import { requestPersistentStorage } from '@/offline/db';

/**
 * Корневой провайдер.
 *
 * Что делает на старте:
 *   1. Восстанавливает сессию из sessionStorage.
 *   2. Внедряет в apiClient колбэки: getToken / refresh / onUnauthorized.
 *   3. Запрашивает persistent-storage у браузера.
 *   4. Подключает sync-триггеры (online event + page-load).
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 1. Восстановление сессии
    useAuthStore.getState().restore();

    // 2. Инъекция в apiClient
    // basePath берётся из VITE_API_BASE_URL — обычно полный URL до бэка
    // (например https://<tunnel>.trycloudflare.com/driver-api). В dev можно
    // оставить пустым → клиент ходит относительно origin через vite-proxy.
    apiClient.configure({
      basePath: import.meta.env.VITE_API_BASE_URL || '',
      getToken: () => useAuthStore.getState().token,
      // assumption: refresh endpoint не описан в ТЗ.
      // Возвращаем null — на 401 произойдёт onUnauthorized.
      refresh: async () => null,
      onUnauthorized: () => useAuthStore.getState().logout(),
    });

    // 3. Persistent storage (не критично если откажет)
    void requestPersistentStorage();

    // 4. Sync-триггеры
    installSyncTriggers();
  }, []);

  return <>{children}</>;
}
