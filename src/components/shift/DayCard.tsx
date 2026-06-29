import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/cn';
import type { WorkDay, WorkDayType, WorkDayStatus } from '@/types/workDay';

/**
 * Карточка одного дня в вахте.
 * Если передан `onEdit` — день можно изменить (тап по карточке): вахта идёт и
 * день не утверждён оператором. Иначе — read-only.
 */

interface DayCardProps {
  day: WorkDay;
  /** День ещё в офлайн-очереди (не подтверждён сервером). */
  pending?: boolean;
  /** Если задано — карточка кликабельна и открывает правку дня. */
  onEdit?: () => void;
}

const TYPE_LABEL: Record<WorkDayType, string> = {
  work: 'Работа',
  idle: 'Простой',
  repair: 'Ремонт',
  reloc: 'Перебазирование',
};

const TYPE_STYLE: Record<WorkDayType, string> = {
  work: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  idle: 'bg-amber-50 text-amber-900 border-amber-200',
  repair: 'bg-red-50 text-red-900 border-red-200',
  reloc: 'bg-sky-50 text-sky-900 border-sky-200',
};

const STATUS_LABEL: Record<WorkDayStatus, string> = {
  draft: 'Черновик',
  submitted: 'На проверке',
  approved: 'Подтверждено',
  rejected: 'Возвращено',
};

const STATUS_STYLE: Record<WorkDayStatus, string> = {
  draft: 'bg-ink-100 text-ink-700',
  submitted: 'bg-sky-100 text-sky-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-red-100 text-red-900',
};

export function DayCard({ day, pending = false, onEdit }: DayCardProps) {
  const date = new Date(day.date);

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-ink-900">
            {format(date, 'd MMM', { locale: ru })}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              TYPE_STYLE[day.type],
            )}
          >
            {TYPE_LABEL[day.type]}
          </span>
        </div>
        {day.comment && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{day.comment}</p>}
        {day.rejectComment && <p className="mt-1 text-sm text-red-700">⚠ {day.rejectComment}</p>}
        {onEdit && <p className="mt-1 text-xs text-brand-700">Нажмите, чтобы изменить</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {day.hours > 0 && <span className="text-xl font-bold text-ink-900">{day.hours} ч</span>}
        {(day.repairHours ?? 0) > 0 && (
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
            🔧 ремонт {day.repairHours} ч
          </span>
        )}
        {pending ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            ⏳ ждёт отправки
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_STYLE[day.status],
            )}
          >
            {STATUS_LABEL[day.status]}
          </span>
        )}
      </div>
    </>
  );

  const cls = cn(
    'flex w-full items-start justify-between gap-3 rounded-xl border bg-white p-3 text-left',
    pending ? 'border-dashed border-amber-300' : 'border-ink-200',
    onEdit && 'transition-colors hover:bg-ink-50 active:bg-ink-100',
  );

  if (onEdit) {
    return (
      <button type="button" onClick={onEdit} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
