import { apiClient } from '@/api/client';
import type { LegalEntity, Site } from '@/types/site';

/**
 * Объекты и юрлица.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   - GET /api/objects         → {data: [{id, name, address, legal_entity_id, legal_entity_name}]}
 *   - GET /api/legal-entities  → {data: [{id, name, inn, kpp}]}
 *
 * На фронте сохраняем имя `sitesApi` (с типом `Site`) — миграция на термин
 * «объект» в UI потребует переименования множества компонентов; пока mapping
 * прозрачен. snake_case → camelCase нормализуется здесь.
 */

interface RawObject {
  id: number;
  name: string;
  address?: string;
  legal_entity_id?: number;
  legal_entity_name?: string;
  visible_to_drivers?: number | boolean;
}

interface RawLegalEntity {
  id: number;
  name: string;
  inn?: string;
  kpp?: string;
}

function normalizeObject(raw: RawObject): Site {
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address,
    customer: raw.legal_entity_name,
    legalEntityId: raw.legal_entity_id,
    // Если бэк не прислал флаг (старый ответ) — считаем видимым.
    visibleToDrivers: raw.visible_to_drivers == null ? true : !!raw.visible_to_drivers,
  };
}

function normalizeLegalEntity(raw: RawLegalEntity): LegalEntity {
  return {
    id: raw.id,
    name: raw.name,
    inn: raw.inn,
  };
}

export interface ObjectInput {
  name: string;
  address?: string;
  legalEntityId?: string | number | null;
  visibleToDrivers?: boolean;
}

export const sitesApi = {
  list: async (): Promise<Site[]> => {
    const raw = await apiClient.get<{ data: RawObject[] } | RawObject[]>('/api/objects');
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalizeObject);
  },

  /** Создать объект (только оператор). */
  create: async (body: ObjectInput): Promise<{ id: number }> => {
    return apiClient.post<{ id: number }>('/api/objects', {
      name: body.name,
      address: body.address ?? null,
      legal_entity_id: body.legalEntityId ?? null,
      visible_to_drivers: body.visibleToDrivers === false ? 0 : 1,
    });
  },

  /** Изменить объект (оператор): видимость, поля, архивация (is_active). */
  update: async (
    id: string | number,
    patch: Partial<ObjectInput> & { isActive?: boolean },
  ): Promise<{ ok: boolean }> => {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.address !== undefined) body.address = patch.address;
    if (patch.legalEntityId !== undefined) body.legal_entity_id = patch.legalEntityId;
    if (patch.visibleToDrivers !== undefined) body.visible_to_drivers = patch.visibleToDrivers ? 1 : 0;
    if (patch.isActive !== undefined) body.is_active = patch.isActive ? 1 : 0;
    return apiClient.request<{ ok: boolean }>(`/api/objects/${id}`, { method: 'PATCH', body });
  },
};

export const legalEntitiesApi = {
  list: async (): Promise<LegalEntity[]> => {
    const raw = await apiClient.get<{ data: RawLegalEntity[] } | RawLegalEntity[]>(
      '/api/legal-entities',
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalizeLegalEntity);
  },
};
