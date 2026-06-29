import { apiClient } from '@/api/client';
import { submitOrQueue } from '@/offline/submit';
import type { WorkDay, WorkDayStatus, WorkDayType, IdleReason } from '@/types/workDay';

/**
 * Рабочие дни.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   GET  /api/work-days?shift_id=&driver_id=&status=
 *        → {data: [{id, shift_id, driver_id, equipment_id, object_id,
 *                   work_date, day_number, time_start, time_end, hours_worked,
 *                   operations, fuel_start, fuel_end, fuel_consumed, notes,
 *                   status, ...}]}
 *   POST /api/work-days  body: { shift_id, work_date, hours_worked, notes, ... }
 *
 * Бэк не различает work/idle/repair напрямую — хранит часы за день и notes.
 * Тип дня (фронт) кладётся в notes как JSON, чтобы при чтении восстановить.
 * Это assumption — со временем бэк добавит явное поле type.
 */

interface RawWorkDay {
  id: number;
  shift_id: number;
  driver_id?: number;
  work_date: string;
  day_number?: number;
  time_start?: string | null;
  time_end?: string | null;
  hours_worked?: number;
  repair_hours?: number | null;
  operations?: string | null;
  fuel_start?: number | null;
  fuel_end?: number | null;
  notes?: string | null;
  status?: WorkDayStatus;
}

interface NotesPayload {
  type?: WorkDayType;
  idleReason?: IdleReason;
  comment?: string;
}

function parseNotes(s: string | null | undefined): NotesPayload {
  if (!s) return {};
  // Сначала пробуем JSON; если не JSON — кладём в comment.
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') return j as NotesPayload;
  } catch {
    // not json
  }
  return { comment: s };
}

function buildNotes(body: Partial<WorkDay>): string | undefined {
  const p: NotesPayload = {};
  if (body.type) p.type = body.type;
  if (body.idleReason) p.idleReason = body.idleReason;
  if (body.comment) p.comment = body.comment;
  if (!p.type && !p.idleReason && !p.comment) return undefined;
  return JSON.stringify(p);
}

function normalize(raw: RawWorkDay): WorkDay {
  const meta = parseNotes(raw.notes ?? undefined);
  return {
    id: String(raw.id),
    shiftId: String(raw.shift_id),
    date: raw.work_date,
    type: meta.type ?? 'work',
    hours: raw.hours_worked ?? 0,
    repairHours: raw.repair_hours ?? 0,
    comment: meta.comment,
    idleReason: meta.idleReason,
    status: raw.status ?? 'draft',
  };
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

export const workDaysApi = {
  list: async (params?: { shiftId?: string; from?: string; to?: string; status?: string }): Promise<WorkDay[]> => {
    const qs = new URLSearchParams();
    if (params?.shiftId) qs.set('shift_id', params.shiftId);
    if (params?.from) qs.set('date_from', params.from);
    if (params?.to) qs.set('date_to', params.to);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const raw = await apiClient.get<{ data: RawWorkDay[] } | RawWorkDay[]>(
      '/api/work-days' + query,
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  /** Нормализовать raw-дни из агрегата (verify.ts). */
  fromRawList: (arr: unknown): WorkDay[] => (Array.isArray(arr) ? arr : []).map((r) => normalize(r as RawWorkDay)),

  create: async (body: Partial<WorkDay>): Promise<WorkDay> => {
    const payload = {
      shift_id: body.shiftId,
      work_date: body.date,
      hours_worked: body.hours,
      repair_hours: body.repairHours ?? 0,
      notes: buildNotes(body),
    };
    // Восстановленная запись (бэк вернул только {id}, либо ушло в очередь).
    const fallback = (id: string): WorkDay => ({
      id,
      shiftId: String(body.shiftId ?? ''),
      date: body.date ?? '',
      type: body.type ?? 'work',
      hours: body.hours ?? 0,
      repairHours: body.repairHours ?? 0,
      comment: body.comment,
      idleReason: body.idleReason,
      status: 'submitted',
    });

    const { result, queued, queuedId } = await submitOrQueue<{ id: number } | { data: RawWorkDay }>({
      url: '/api/work-days',
      method: 'POST',
      json: payload,
      entityType: 'work_day',
      entityId: body.shiftId ?? undefined,
    });
    if (queued) return fallback(`local:${queuedId}`);

    const c = result as { id?: number; data?: RawWorkDay };
    if (c.data) return normalize(c.data);
    if (typeof c.id === 'number') {
      // Подтянем созданный день обратно
      const back = await apiClient.get<{ data: RawWorkDay } | RawWorkDay>(
        `/api/work-days/${c.id}`,
      );
      return normalize(unwrap(back));
    }
    return fallback('');
  },

  submit: async (id: string): Promise<WorkDay> => {
    const r = await apiClient.post<{ data: RawWorkDay } | RawWorkDay>(
      `/api/work-days/${id}/submit`,
    );
    return normalize(unwrap(r));
  },
  approve: async (id: string): Promise<WorkDay> => {
    const r = await apiClient.post<{ data: RawWorkDay } | RawWorkDay>(
      `/api/work-days/${id}/approve`,
    );
    return normalize(unwrap(r));
  },
  reject: async (id: string, body: { comment: string }): Promise<WorkDay> => {
    const r = await apiClient.post<{ data: RawWorkDay } | RawWorkDay>(
      `/api/work-days/${id}/reject`,
      body,
    );
    return normalize(unwrap(r));
  },
};
