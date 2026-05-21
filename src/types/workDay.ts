/**
 * Запись о рабочем дне в рамках вахты.
 *
 * Тип дня (WorkDayType):
 *   work     — нормальный рабочий день
 *   idle     — простой (с причиной)
 *   repair   — ремонт (с описанием)
 *   reloc    — перебазирование (v2 в research, в MVP допускаем тип в типах)
 *
 * Статус (WorkDayStatus):
 *   draft       — черновик (только локально или после POST)
 *   submitted   — отправлен оператору на проверку
 *   approved    — оператор подтвердил
 *   rejected    — оператор вернул на правку (с комментарием)
 */

export type WorkDayType = 'work' | 'idle' | 'repair' | 'reloc';
export type WorkDayStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type IdleReason = 'weather' | 'waiting' | 'external' | 'other';

export interface WorkDay {
  id: string;
  shiftId: string;
  date: string; // ISO yyyy-mm-dd
  type: WorkDayType;
  hours: number; // 0..24
  comment?: string;
  idleReason?: IdleReason;
  status: WorkDayStatus;
  rejectComment?: string;
}
