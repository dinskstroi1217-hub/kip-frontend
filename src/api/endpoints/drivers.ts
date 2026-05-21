import { apiClient } from '@/api/client';
import type { Driver } from '@/types/user';

/**
 * Справочник водителей.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   - GET /api/public/drivers — публичный (без JWT), отдаёт {data: [{id, full_name, phone}]}
 *     для экрана входа PWA.
 *   - GET /api/drivers — только operator-role, полная информация. Используется
 *     в admin-UI (не в этом MVP).
 *
 * Поля бэка: snake_case. Здесь нормализуем к camelCase.
 */

interface RawDriver {
  id: string | number;
  full_name?: string;
  fullName?: string;
  phone: string;
  hourly_rate?: number;
  hourlyRate?: number;
  available?: boolean;
}

function normalize(raw: RawDriver): Driver {
  return {
    id: raw.id,
    role: 'driver',
    fullName: raw.fullName ?? raw.full_name ?? '',
    phone: raw.phone,
    hourlyRate: raw.hourlyRate ?? raw.hourly_rate,
    available: raw.available,
  };
}

export const driversApi = {
  list: async (): Promise<Driver[]> => {
    const raw = await apiClient.get<{ data: RawDriver[] } | RawDriver[]>(
      '/api/public/drivers',
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },
};
