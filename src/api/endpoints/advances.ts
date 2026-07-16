import { apiClient } from '@/api/client';

/**
 * Подотчётные (счёт 71.01) — этап 2.
 *   GET  /api/advances/unassigned   — неразнесённые выдачи (нет вахты) + неопознанные ФИО
 *   GET  /api/advances/shift/:id    — выдачи вахты + агрегат выдано/потрачено/остаток
 *   PATCH /api/advances/:id         — привязать выдачу к вахте (или отвязать)
 */

export interface NearShift {
  id: number;
  start: string;
  end: string;
  status: string;
}
export interface UnassignedAdvance {
  id: number;
  employee_id: number | null;
  fio: string;
  emp_name: string | null;
  issue_date: string;
  amount: number;
  nearShifts: NearShift[];
}
export interface ShiftAdvanceRow {
  id: number;
  issue_date: string;
  amount: number;
  assigned_manually: number;
}
export interface ShiftAdvances {
  advances: ShiftAdvanceRow[];
  issued: number;
  spent: number;
  ostatok: number;
}

export const advancesApi = {
  async unassigned(): Promise<UnassignedAdvance[]> {
    const r = await apiClient.get<{ data: UnassignedAdvance[] }>('/api/advances/unassigned');
    return r.data ?? [];
  },
  async forShift(shiftId: string | number): Promise<ShiftAdvances> {
    const r = await apiClient.get<{ data: ShiftAdvances }>(`/api/advances/shift/${shiftId}`);
    return r.data;
  },
  async assign(id: number, shiftId: number | null): Promise<void> {
    await apiClient.patch(`/api/advances/${id}`, { shift_id: shiftId });
  },
};
