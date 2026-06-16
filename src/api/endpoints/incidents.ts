import { apiClient } from '@/api/client';
import { submitOrQueue } from '@/offline/submit';
import type { Incident, IncidentType, IncidentStatus } from '@/types/incident';

/**
 * Инциденты.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   GET  /api/incidents?shift_id=
 *        → {data: [{id, shift_id, driver_id, equipment_id, incident_date,
 *                   type, description, severity, downtime_hours, photos,
 *                   resolved, ...}]}
 *   POST /api/incidents
 *        body: { shift_id, incident_date, type, description, severity?,
 *                downtime_hours?, downtime_reason? }
 *
 * Типы (см. *_TYPE ниже).
 */

// frontend → backend
const TYPE_TO_BACKEND: Record<IncidentType, string> = {
  idle: 'other',     // idle на бэке — work_day с hours=0, не отдельный incident
  repair: 'breakdown',
  damage: 'accident',
  other: 'other',
};

// backend → frontend
const TYPE_FROM_BACKEND: Record<string, IncidentType> = {
  breakdown: 'repair',
  accident: 'damage',
  fuel_shortage: 'other',
  tire: 'repair',
  other: 'other',
};

interface RawIncident {
  id: number;
  shift_id: number;
  driver_id?: number;
  incident_date: string;
  type: string;
  description: string;
  severity?: string;
  downtime_hours?: number;
  photos?: string | null;
  resolved?: number | boolean;
  resolved_at?: string | null;
  created_at?: string;
}

function normalize(raw: RawIncident): Incident {
  let photoIds: string[] | undefined;
  if (raw.photos) {
    try {
      const parsed = JSON.parse(raw.photos);
      if (Array.isArray(parsed)) photoIds = parsed;
    } catch {
      // not json
    }
  }
  const status: IncidentStatus = raw.resolved ? 'resolved' : 'open';
  return {
    id: String(raw.id),
    shiftId: String(raw.shift_id),
    type: TYPE_FROM_BACKEND[raw.type] ?? 'other',
    description: raw.description,
    status,
    reportedAt: raw.created_at ?? raw.incident_date,
    resolvedAt: raw.resolved_at ?? undefined,
    photoIds,
  };
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

export const incidentsApi = {
  list: async (params?: { shiftId?: string }): Promise<Incident[]> => {
    const q = params?.shiftId ? `?shift_id=${params.shiftId}` : '';
    const raw = await apiClient.get<{ data: RawIncident[] } | RawIncident[]>(
      '/api/incidents' + q,
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  create: async (body: Partial<Incident>): Promise<Incident> => {
    const payload = {
      shift_id: body.shiftId,
      incident_date: new Date().toISOString().slice(0, 10),
      type: body.type ? TYPE_TO_BACKEND[body.type] : 'other',
      description: body.description ?? '',
      severity: 'medium',
    };
    const fallback = (id: string): Incident => ({
      id,
      shiftId: String(body.shiftId ?? ''),
      type: body.type ?? 'other',
      description: body.description ?? '',
      status: 'open',
      reportedAt: new Date().toISOString(),
      photoIds: body.photoIds,
    });
    const { result, queued, queuedId } = await submitOrQueue<
      { id: number } | { data: RawIncident } | RawIncident
    >({
      url: '/api/incidents',
      method: 'POST',
      json: payload,
      entityType: 'incident',
      entityId: body.shiftId ?? undefined,
    });
    if (queued) return fallback(`local:${queuedId}`);
    const c = result as { id?: number; data?: RawIncident };
    if (c.data) return normalize(c.data);
    if (typeof c.id === 'number') return fallback(String(c.id));
    return normalize(result as RawIncident);
  },

  /**
   * Инцидент с фото (ремонт/повреждение) — multipart. Бэк ждёт ПЛОСКИЕ
   * snake_case поля (как /api/acceptance), НЕ вложенный JSON-`payload`:
   * shift_id, incident_date, type (backend-значение через TYPE_TO_BACKEND),
   * description, severity + файлы `photos`. Раньше слался camelCase-конверт
   * `payload` с немаппленным type → бэк не находил полей → поломка с фото
   * терялась (см. ночной аудит, fix #54). Офлайн-безопасно: при отсутствии
   * связи Blob'ы и поля кладутся в очередь (submitOrQueue) и дошлются позже.
   */
  createWithPhotos: async (body: {
    shiftId: string;
    type: IncidentType;
    description: string;
    photos: Blob[];
  }): Promise<Incident> => {
    const fd = new FormData();
    fd.append('shift_id', body.shiftId);
    fd.append('incident_date', new Date().toISOString().slice(0, 10));
    fd.append('type', TYPE_TO_BACKEND[body.type]);
    fd.append('description', body.description);
    fd.append('severity', 'medium');
    body.photos.forEach((b, i) => fd.append('photos', b, `${body.type}-${i + 1}.jpg`));

    const fallback = (id: string): Incident => ({
      id,
      shiftId: body.shiftId,
      type: body.type,
      description: body.description,
      status: 'open',
      reportedAt: new Date().toISOString(),
    });

    const { result, queued, queuedId } = await submitOrQueue<
      Incident | { id: number } | { data: RawIncident } | RawIncident
    >({
      url: '/api/incidents',
      method: 'POST',
      formData: fd,
      entityType: 'incident',
      entityId: body.shiftId,
    });
    if (queued) return fallback(`local:${queuedId}`);
    const c = result as { id?: number; data?: RawIncident };
    if (c && c.data) return normalize(c.data);
    if (c && typeof c.id === 'number') return fallback(String(c.id));
    return normalize(result as RawIncident);
  },

  resolve: async (id: string): Promise<Incident> => {
    const r = await apiClient.post<{ data: RawIncident } | RawIncident>(
      `/api/incidents/${id}/resolve`,
    );
    return normalize(unwrap(r));
  },
};
