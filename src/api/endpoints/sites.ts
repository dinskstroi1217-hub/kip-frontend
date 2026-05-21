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
  };
}

function normalizeLegalEntity(raw: RawLegalEntity): LegalEntity {
  return {
    id: raw.id,
    name: raw.name,
    inn: raw.inn,
  };
}

export const sitesApi = {
  list: async (): Promise<Site[]> => {
    const raw = await apiClient.get<{ data: RawObject[] } | RawObject[]>('/api/objects');
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalizeObject);
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
