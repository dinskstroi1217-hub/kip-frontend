import { apiClient } from '@/api/client';
import { shiftsApi } from './shifts';
import { acceptanceApi } from './acceptance';
import { workDaysApi } from './workDays';
import { expensesApi } from './expenses';
import { incidentsApi } from './incidents';
import type { PhotosByShift } from './photos';
import type { Shift } from '@/types/shift';
import type { AcceptanceAct, ReturnAct } from '@/types/acceptance';
import type { WorkDay } from '@/types/workDay';
import type { Expense } from '@/types/expense';
import type { Incident } from '@/types/incident';

/**
 * Агрегат экрана проверки вахты (перформанс). ОДИН запрос
 * `GET /api/operator/shifts/:id/full` вместо 7 (shift + acceptance + return +
 * work-days + expenses + incidents + photos). Бэк отдаёт raw-формы, здесь
 * нормализуем теми же функциями, что и отдельные эндпоинты (fromRaw/fromRawList).
 */
export interface VerifyFull {
  shift: Shift | null;
  acceptance: AcceptanceAct | null;
  returnAct: ReturnAct | null;
  days: WorkDay[];
  expenses: Expense[];
  incidents: Incident[];
  photos: PhotosByShift;
}

interface RawBundle {
  shift?: unknown;
  acceptance?: unknown;
  return?: unknown;
  work_days?: unknown;
  expenses?: unknown;
  incidents?: unknown;
  photos?: PhotosByShift;
}

const emptyPhotos: PhotosByShift = { acceptance: [], return: [], reports: [], receipts: [], incidents: [] };

export const verifyApi = {
  full: async (shiftId: string): Promise<VerifyFull> => {
    const r = await apiClient.get<{ data: RawBundle } | RawBundle>(`/api/operator/shifts/${shiftId}/full`);
    const b = (r as { data?: RawBundle }).data ?? (r as RawBundle);
    return {
      shift: b.shift ? shiftsApi.fromRaw(b.shift) : null,
      acceptance: acceptanceApi.fromRaw(b.acceptance),
      returnAct: acceptanceApi.returnFromRaw(b.return),
      days: workDaysApi.fromRawList(b.work_days),
      expenses: expensesApi.fromRawList(b.expenses),
      incidents: incidentsApi.fromRawList(b.incidents),
      photos: b.photos ?? emptyPhotos,
    };
  },
};
