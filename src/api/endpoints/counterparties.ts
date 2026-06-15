import { apiClient } from '@/api/client';

/**
 * Контрагенты. Источник — выгрузка 1С (sync раз в сутки, бэк), плюс
 * флаг видимости водителю (visible_to_drivers), управляемый диспетчером.
 *
 *   GET   /api/counterparties        — driver: видимые; operator: все + флаг
 *   PATCH /api/counterparties/:id    — operator: видимость / архивация
 */

export interface Counterparty {
  id: number;
  name: string;
  inn?: string;
  visibleToDrivers: boolean;
  syncedAt?: string | null;
}

interface RawCounterparty {
  id: number;
  name: string;
  inn?: string | null;
  visible_to_drivers?: number | boolean;
  synced_at?: string | null;
}

function normalize(r: RawCounterparty): Counterparty {
  return {
    id: r.id,
    name: r.name,
    inn: r.inn ?? undefined,
    visibleToDrivers: r.visible_to_drivers == null ? true : !!r.visible_to_drivers,
    syncedAt: r.synced_at ?? null,
  };
}

export const counterpartiesApi = {
  list: async (): Promise<Counterparty[]> => {
    const raw = await apiClient.get<{ data: RawCounterparty[] } | RawCounterparty[]>(
      '/api/counterparties',
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  setVisible: async (id: number, visible: boolean): Promise<void> => {
    await apiClient.request(`/api/counterparties/${id}`, {
      method: 'PATCH',
      body: { visible_to_drivers: visible ? 1 : 0 },
    });
  },
};
