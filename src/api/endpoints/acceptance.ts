import { apiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { AcceptanceAct, ReturnAct } from '@/types/acceptance';

/**
 * Подпись акта (приёмки или сдачи). `role` различает водителя и представителя
 * объекта; на возврат — дополнительно ФИО+должность представителя.
 *
 * Бэк хранит факт подписания (`driver_signed`/`operator_signed` boolean +
 * timestamp). Поле `signature` принимает любую строку («confirmed» в нашем
 * MVP) — это ПЭП через сессию, см. ActConfirmation.tsx.
 */
export interface SignBody {
  signature: string;
  role?: 'driver' | 'representative';
  representativeFullName?: string;
  representativePosition?: string;
}

// ============================================================================
// Raw → typed normalization
// ============================================================================

interface RawAcceptance {
  id: number;
  shift_id: number;
  driver_id: number;
  odometer_start?: number | null;
  fuel_level?: string | null;
  fuel_liters?: number | null;
  gps_lat?: number | null;
  gps_lon?: number | null;
  gps_accuracy_m?: number | null;
  exterior_ok?: number | boolean;
  damage_notes?: string | null;
  photos?: string | null;
  driver_signed?: number | boolean;
  driver_sign_at?: string | null;
  operator_signed?: number | boolean;
  operator_id?: number | null;
  operator_sign_at?: string | null;
  created_at?: string;
  driver_name?: string;
  operator_name?: string;
}

interface RawReturn extends RawAcceptance {
  odometer_end?: number | null;
  damage_photos?: string | null;
  representative_full_name?: string | null;
  representative_position?: string | null;
}

function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function normalizeAcceptance(raw: RawAcceptance): AcceptanceAct {
  const checklist = {
    oilLevel: 'ok' as const,
    fuelStartLiters: raw.fuel_liters ?? 0,
    odometerStart: raw.odometer_start ?? 0,
    hasVisibleDamage: !raw.exterior_ok,
    damageDescription: raw.damage_notes ?? undefined,
    tires: 'ok' as const,
  };
  return {
    id: String(raw.id),
    shiftId: String(raw.shift_id),
    checklist,
    photoIds: parsePhotos(raw.photos),
    gps:
      raw.gps_lat != null && raw.gps_lon != null
        ? {
            lat: raw.gps_lat,
            lng: raw.gps_lon,
            accuracy: raw.gps_accuracy_m ?? 0,
            timestamp: 0,
          }
        : null,
    driverSignatureBase64: raw.driver_signed ? 'confirmed' : undefined,
    representativeSignatureBase64: raw.operator_signed ? 'confirmed' : undefined,
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}

function normalizeReturn(raw: RawReturn): ReturnAct {
  return {
    id: String(raw.id),
    shiftId: String(raw.shift_id),
    odometerEnd: raw.odometer_end ?? 0,
    fuelEndLiters: raw.fuel_liters ?? 0,
    photoIds: parsePhotos(raw.photos),
    reportPhotoIds: parsePhotos(raw.damage_photos),
    gps:
      raw.gps_lat != null && raw.gps_lon != null
        ? {
            lat: raw.gps_lat,
            lng: raw.gps_lon,
            accuracy: raw.gps_accuracy_m ?? 0,
            timestamp: 0,
          }
        : null,
    driverSignatureBase64: raw.driver_signed ? 'confirmed' : undefined,
    representativeSignatureBase64: raw.operator_signed ? 'confirmed' : undefined,
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

// ============================================================================
// API
// ============================================================================

export const acceptanceApi = {
  create: (body: Partial<AcceptanceAct>) =>
    apiClient.post<AcceptanceAct>('/api/acceptance', body),
  sign: (id: string, body: SignBody) =>
    apiClient.post<AcceptanceAct>(`/api/acceptance/${id}/sign`, body),
  return: (id: string, body: Partial<ReturnAct>) =>
    apiClient.post<ReturnAct>(`/api/acceptance/${id}/return`, body),
  returnSign: (id: string, body: SignBody) =>
    apiClient.post<ReturnAct>(`/api/acceptance/${id}/return/sign`, body),

  /**
   * Получить акт приёмки по shiftId. Возвращает null если акта нет
   * (бэк отдаёт 404 — это нормально, пока водитель не дошёл до конца wizard'а).
   */
  byShiftId: async (shiftId: string): Promise<AcceptanceAct | null> => {
    try {
      const raw = await apiClient.get<{ data: RawAcceptance } | RawAcceptance>(
        `/api/acceptance/${shiftId}`,
      );
      return normalizeAcceptance(unwrap(raw));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  /**
   * Получить акт сдачи по shiftId. Возвращает null если ещё не сдано.
   */
  returnByShiftId: async (shiftId: string): Promise<ReturnAct | null> => {
    try {
      const raw = await apiClient.get<{ data: RawReturn } | RawReturn>(
        `/api/acceptance/${shiftId}/return`,
      );
      return normalizeReturn(unwrap(raw));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  /** Нормализовать raw-приёмку/сдачу из агрегата (verify.ts). null если нет акта. */
  fromRaw: (raw: unknown): AcceptanceAct | null => (raw ? normalizeAcceptance(raw as RawAcceptance) : null),
  returnFromRaw: (raw: unknown): ReturnAct | null => (raw ? normalizeReturn(raw as RawReturn) : null),
};
