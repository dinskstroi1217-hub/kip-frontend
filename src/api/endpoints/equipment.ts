import { apiClient } from '@/api/client';
import type { Equipment, EquipmentType, EquipmentStatus } from '@/types/equipment';

/**
 * Техника.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   GET /api/equipment → {data: [{id, name, type, license_plate, vin, year,
 *                                 fuel_type, fuel_tank_liters, odometer_km,
 *                                 is_active, legal_entity_id, legal_entity_name, ...}]}
 *
 * Бэк отдаёт `license_plate` — фронт ожидает `regNumber`. Нормализуем.
 * `status` бэк не отдаёт — для MVP считаем все активные как `available`.
 */

interface RawEquipment {
  id: number;
  name: string;
  type: string;
  license_plate?: string;
  vin?: string | null;
  year?: number | null;
  fuel_type?: string;
  fuel_tank_liters?: number | null;
  odometer_km?: number;
  is_active?: number | boolean;
  glonass_id?: string | null;
  legal_entity_id?: number;
  legal_entity_name?: string;
}

function normalizeType(t: string): EquipmentType {
  const known: EquipmentType[] = [
    'truck', 'crane', 'excavator', 'concrete_mixer', 'dump_truck', 'loader', 'other',
  ];
  return (known.includes(t as EquipmentType) ? t : 'other') as EquipmentType;
}

function normalize(raw: RawEquipment): Equipment {
  return {
    id: raw.id,
    regNumber: raw.license_plate ?? '',
    name: raw.name,
    type: normalizeType(raw.type),
    status: (raw.is_active ? 'available' : 'out_of_service') as EquipmentStatus,
    lastOdometer: raw.odometer_km ?? undefined,
    glonassId: raw.glonass_id ?? undefined,
    legalEntityId: raw.legal_entity_id ?? null,
  };
}

export const equipmentApi = {
  list: async (): Promise<Equipment[]> => {
    const raw = await apiClient.get<{ data: RawEquipment[] } | RawEquipment[]>('/api/equipment');
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },
  /** Нормализовать raw-технику из агрегата (доска /api/operator/board). */
  fromRawList: (arr: unknown): Equipment[] => (Array.isArray(arr) ? arr : []).map((r) => normalize(r as RawEquipment)),
  byId: async (id: string): Promise<Equipment> => {
    const raw = await apiClient.get<{ data: RawEquipment } | RawEquipment>(`/api/equipment/${id}`);
    const r = (raw as { data?: RawEquipment }).data ?? (raw as RawEquipment);
    return normalize(r);
  },
  glonass: (id: string) => apiClient.get<unknown>(`/api/equipment/${id}/glonass`),
};
