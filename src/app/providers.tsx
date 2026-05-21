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
    apiClient.configure({
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
