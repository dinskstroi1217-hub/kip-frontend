import { apiClient } from '@/api/client';
import { equipmentApi } from './equipment';
import type { Shift, ShiftStatus, ShiftSummary } from '@/types/shift';
import type { Equipment } from '@/types/equipment';

/** Флаг-проблема вахты, посчитанный бэком (агрегат /api/operator/home). */
export interface ProblemFlag {
  key: string;
  label: string;
  sev: 'error' | 'warn' | 'action';
}
/** Строка агрегата главной диспетчера: вахта + готовые проблемы. */
export interface OperatorHomeRow {
  shift: Shift;
  problems: ProblemFlag[];
}

/**
 * вахты (shifts на бэке).
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   GET    /api/shifts             — только operator (фронт водителя не использует)
 *   GET    /api/shifts/my          — водитель: свои
 *   GET    /api/shifts/:id         — driver видит свои, operator — все
 *   POST   /api/shifts             — создать (driver — себе, operator — любому)
 *   PATCH  /api/shifts/:id         — только operator
 *   POST   /api/shifts/:id/activate — planned → active
 *   POST   /api/shifts/:id/complete — active → completed
 *
 * Расхождения с типом `Shift` на фронте (4 статуса бэка vs 7 фронта):
 *   Бэк:    planned | active | completed | cancelled
 *   Фронт:  free | pending_acceptance | active | issue_idle | issue_repair
 *           | pending_verification | verified
 *
 * Mapping (см. STATUS_FROM_BACKEND / STATUS_TO_BACKEND ниже):
 *   planned        ↔ pending_acceptance
 *   active         ↔ active
 *   completed      ↔ pending_verification (по умолчанию; verified — отдельный
 *                    флаг на бэке потребует расширения)
 *   cancelled      ↔ verified            (заглушка — закрытое состояние)
 *
 * issue_idle / issue_repair — это «надстройки» на active со стороны фронта.
 * Бэк хранит их как active + соответствующий incident.
 */

// ============================================================================
// Status mapping
// ============================================================================

// Колонка status на бэке — TEXT без constraint. 'verified' — честный
// терминальный статус закрытой вахты (раньше verified маппился в 'completed',
// из-за чего «Принять и закрыть» не убирало вахту из очереди — E2E 2026-06-11).
type BackendShiftStatus = 'planned' | 'active' | 'completed' | 'verified' | 'cancelled';

const STATUS_FROM_BACKEND: Record<BackendShiftStatus, ShiftStatus> = {
  planned: 'pending_acceptance',
  active: 'active',
  completed: 'pending_verification',
  verified: 'verified',
  cancelled: 'verified',
};

const STATUS_TO_BACKEND: Partial<Record<ShiftStatus, BackendShiftStatus>> = {
  free: 'planned',
  pending_acceptance: 'planned',
  active: 'active',
  issue_idle: 'active',
  issue_repair: 'active',
  pending_verification: 'completed',
  verified: 'verified',
};

// ============================================================================
// Raw <-> Shift normalization
// ============================================================================

interface RawShift {
  id: number;
  driver_id: number;
  equipment_id: number | null;
  object_id: number | null;
  legal_entity_id: number | null;
  counterparty_id: number | null;
  status: BackendShiftStatus;
  planned_start: string;
  planned_end: string;
  planned_days?: number;
  actual_start?: string | null;
  actual_end?: string | null;
  daily_rate?: number | null;
  total_worked?: number | null;
  total_pay?: number | null;
  hourly_rate?: number | null;
  rate_override?: number | null;
  rate_bonus?: number | null;
  pay_note?: string | null;
  sell_rate?: number | null;
  per_diem_rate?: number | null;
  per_diem_days?: number | null;
  per_diem_total?: number | null;
  deduction?: number | null;
  deduction_note?: string | null;
  repair_rate?: number | null;
  repair_hours?: number | null;
  repair_total?: number | null;
  net_pay?: number | null;
  problems?: ProblemFlag[];
  notes?: string | null;
  // joined fields
  driver_name?: string;
  driver_phone?: string;
  equipment_name?: string;
  license_plate?: string;
  object_name?: string;
  object_address?: string;
  legal_entity_name?: string;
  counterparty_name?: string;
  // odometer/fuel/motohours — на бэке хранятся в machine_acceptance/return,
  // но в этой модели Shift'а фронта они нужны. Получаем отдельным запросом
  // к /api/acceptance/:shift_id и /api/acceptance/:shift_id/return.
}

function normalize(raw: RawShift): Shift {
  return {
    id: String(raw.id),
    driverId: raw.driver_id,
    equipmentId: raw.equipment_id,
    siteId: raw.object_id,
    legalEntityId: raw.legal_entity_id,
    counterpartyId: raw.counterparty_id ?? null,
    status: STATUS_FROM_BACKEND[raw.status] ?? 'pending_acceptance',
    startDate: raw.planned_start,
    endDatePlanned: raw.planned_end,
    endDateActual: raw.actual_end ?? null,
    odometerStart: null, // см. acceptanceApi.byShiftId
    odometerEnd: null,   // см. acceptanceApi.returnByShiftId
    fuelLevelStart: null,
    fuelLevelEnd: null,
    motohoursStart: null,
    motohoursEnd: null,
    notes: raw.notes ?? undefined,
    hourlyRate: raw.hourly_rate ?? null,
    rateOverride: raw.rate_override ?? null,
    rateBonus: raw.rate_bonus ?? null,
    payNote: raw.pay_note ?? null,
    totalWorked: raw.total_worked ?? null,
    totalPay: raw.total_pay ?? null,
    sellRate: raw.sell_rate ?? null,
    perDiemRate: raw.per_diem_rate ?? null,
    perDiemDays: raw.per_diem_days ?? null,
    perDiemTotal: raw.per_diem_total ?? null,
    deduction: raw.deduction ?? null,
    deductionNote: raw.deduction_note ?? null,
    repairRate: raw.repair_rate ?? null,
    repairHours: raw.repair_hours ?? null,
    repairTotal: raw.repair_total ?? null,
    netPay: raw.net_pay ?? null,
    driverName: raw.driver_name,
    driverPhone: raw.driver_phone,
    equipmentName: raw.equipment_name,
    equipmentRegNumber: raw.license_plate,
    siteName: raw.object_name,
    siteAddress: raw.object_address,
    legalEntityName: raw.legal_entity_name,
    counterpartyName: raw.counterparty_name,
  };
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

// ============================================================================
// API
// ============================================================================

export const shiftsApi = {
  list: async (params?: {
    driverId?: number | string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<Shift[]> => {
    const qs = new URLSearchParams();
    if (params?.driverId != null && params.driverId !== '') qs.set('driver_id', String(params.driverId));
    if (params?.status) qs.set('status', params.status);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const raw = await apiClient.get<{ data: RawShift[] } | RawShift[]>(`/api/shifts${suffix}`);
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  my: async (): Promise<Shift[]> => {
    const raw = await apiClient.get<{ data: RawShift[] } | RawShift[]>('/api/shifts/my');
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  /** Агрегат главной диспетчера — ОДИН запрос вместо shifts+work-days+incidents.
   *  Бэк отдаёт вахты с готовыми problems; KPI/фильтры фронт считает из них. */
  operatorHome: async (): Promise<OperatorHomeRow[]> => {
    const raw = await apiClient.get<{ data: RawShift[] } | RawShift[]>('/api/operator/home');
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map((r) => ({ shift: normalize(r), problems: r.problems ?? [] }));
  },

  /** Нормализовать raw-вахту из агрегата (verify.ts). */
  fromRaw: (raw: unknown): Shift => normalize(raw as RawShift),

  /** Агрегат доски-графика за месяц — ОДИН запрос (техника + вахты месяца). */
  operatorBoard: async (month: string): Promise<{ equipment: Equipment[]; shifts: Shift[] }> => {
    const r = await apiClient.get<{ data: { equipment: unknown[]; shifts: RawShift[] } } | { equipment: unknown[]; shifts: RawShift[] }>(
      `/api/operator/board?month=${month}`,
    );
    const b = (r as { data?: { equipment: unknown[]; shifts: RawShift[] } }).data ?? (r as { equipment: unknown[]; shifts: RawShift[] });
    return { equipment: equipmentApi.fromRawList(b.equipment), shifts: (b.shifts ?? []).map(normalize) };
  },

  /** Агрегат главной водителя — ОДИН запрос: его вахты (sell_rate скрыт бэком) +
   *  кол-во дней активной вахты (для гейта «Закрыть»). Заменяет my + work-days. */
  driverHome: async (): Promise<{ shifts: Shift[]; activeDaysCount: number }> => {
    const r = await apiClient.get<{ data: { shifts: RawShift[]; activeDaysCount: number } } | { shifts: RawShift[]; activeDaysCount: number }>(
      '/api/shifts/driver-home',
    );
    const b = (r as { data?: { shifts: RawShift[]; activeDaysCount: number } }).data ?? (r as { shifts: RawShift[]; activeDaysCount: number });
    return { shifts: (b.shifts ?? []).map(normalize), activeDaysCount: b.activeDaysCount ?? 0 };
  },

  byId: async (id: string): Promise<Shift> => {
    const raw = await apiClient.get<{ data: RawShift } | RawShift>(`/api/shifts/${id}`);
    return normalize(unwrap(raw));
  },

  /**
   * POST /api/shifts — создать. Принимает body в camelCase, преобразует в snake_case
   * для бэка. Поля одометра/топлива игнорируются на этом шаге (они уходят в
   * acceptance отдельным запросом).
   */
  create: async (body: Partial<Shift>): Promise<Shift> => {
    const days = computePlannedDays(body.startDate, body.endDatePlanned ?? undefined);
    const payload = {
      equipment_id: body.equipmentId,
      object_id: body.siteId,
      legal_entity_id: body.legalEntityId,
      counterparty_id: body.counterpartyId ?? null,
      planned_start: body.startDate,
      planned_end: body.endDatePlanned,
      planned_days: days,
      notes: body.notes,
    };
    const created = await apiClient.post<{ id: number }>('/api/shifts', payload);
    // Бэк возвращает только {id, message} — дочитываем вахту, чтобы вернуть
    // фронту полноценный Shift (как раньше).
    return shiftsApi.byId(String(created.id));
  },

  update: async (id: string, body: Partial<Shift>): Promise<Shift> => {
    const payload: Record<string, unknown> = {};
    if (body.endDatePlanned) payload.planned_end = body.endDatePlanned;
    if (body.status) {
      const mapped = STATUS_TO_BACKEND[body.status];
      if (mapped) payload.status = mapped;
    }
    if (body.notes !== undefined) payload.notes = body.notes;
    await apiClient.patch(`/api/shifts/${id}`, payload);
    return shiftsApi.byId(id);
  },

  /**
   * Расчёт по вахте (только operator): ставка на вахте / надбавка / часы / заметка.
   * total_pay бэк пересчитывает сам по формуле «часы × ставка + надбавка».
   * Передавай null чтобы очистить поле.
   */
  setPay: async (
    id: string,
    body: {
      rateOverride?: number | null;
      rateBonus?: number | null;
      payNote?: string | null;
      totalWorked?: number | null;
      sellRate?: number | null;
      perDiemRate?: number | null;
      deduction?: number | null;
      deductionNote?: string | null;
      repairRate?: number | null;
      repairHours?: number | null;
    },
  ): Promise<Shift> => {
    const payload: Record<string, unknown> = {};
    if ('rateOverride' in body) payload.rate_override = body.rateOverride;
    if ('rateBonus' in body) payload.rate_bonus = body.rateBonus;
    if ('payNote' in body) payload.pay_note = body.payNote;
    if ('totalWorked' in body) payload.total_worked = body.totalWorked;
    if ('sellRate' in body) payload.sell_rate = body.sellRate;
    if ('perDiemRate' in body) payload.per_diem_rate = body.perDiemRate;
    if ('deduction' in body) payload.deduction = body.deduction;
    if ('deductionNote' in body) payload.deduction_note = body.deductionNote;
    if ('repairRate' in body) payload.repair_rate = body.repairRate;
    if ('repairHours' in body) payload.repair_hours = body.repairHours;
    await apiClient.patch(`/api/shifts/${id}`, payload);
    return shiftsApi.byId(id);
  },

  activate: async (id: string): Promise<Shift> => {
    await apiClient.post(`/api/shifts/${id}/activate`);
    return shiftsApi.byId(id);
  },

  complete: async (id: string): Promise<Shift> => {
    await apiClient.post(`/api/shifts/${id}/complete`);
    return shiftsApi.byId(id);
  },
};

function computePlannedDays(start?: string, end?: string): number {
  if (!start || !end) return 1;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
}

export type { Shift, ShiftSummary };
