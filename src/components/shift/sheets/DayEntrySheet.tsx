import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { workDaysApi } from '@/api/endpoints/workDays';
import { ApiError, describeError } from '@/api/errors';
import { cn } from '@/lib/cn';
import type { WorkDayType } from '@/types/workDay';

/**
 * Шторка «Добавить часы» с главного экрана водителя (action-first, ТЗ «упрощение
 * экранов»). День работы/простоя/ремонта → workDaysApi.create.
 *
 * Бэк-валидации (на проде, d6ab9cd) обрабатываем в UI:
 *   - часы 0…24 — клиентская проверка не пускает отправку;
 *   - дубль дня по (shift_id, work_date) → 409 — даём конкретное сообщение
 *     (describeError для 409 generic «Данные изменились»).
 *
 * Дата по умолчанию = сегодня, но можно выбрать прошлую (забыл внести) — не
 * позже сегодня.
 */
const TYPES: { value: WorkDayType; label: string }[] = [
  { value: 'work', label: 'Работа' },
  { value: 'idle', label: 'Простой' },
  { value: 'repair', label: 'Ремонт' },
];

interface DayEntrySheetProps {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  /** Сегодняшняя дата (YYYY-MM-DD) — дефолт и потолок выбора. */
  defaultDate: string;
  onSuccess: () => void;
}

export function DayEntrySheet({ open, onClose, shiftId, defaultDate, onSuccess }: DayEntrySheetProps) {
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState<WorkDayType>('work');
  const [hours, setHours] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursNum = Number(hours);
  const validHours = Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24;
  const valid = !!date && validHours;

  function reset() {
    setDate(defaultDate);
    setType('work');
    setHours('');
    setComment('');
    setError(null);
  }

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await workDaysApi.create({
        shiftId,
        date,
        type,
        hours: hoursNum,
        comment: comment.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('За эту дату день уже внесён. Выберите другую дату или измените существующий день в карточке вахты.');
      } else {
        setError(describeError(e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (saving) return;
        reset();
        onClose();
      }}
      title="Добавить часы"
      description="День работы, простоя или ремонта"
      footer={
        <Button fullWidth size="xl" loading={saving} disabled={!valid} onClick={handleSave}>
          Сохранить день
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Дата</label>
          <input
            type="date"
            value={date}
            max={defaultDate}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Тип дня</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  'min-h-tap rounded-lg border-2 px-3 py-2 text-base font-medium transition-colors',
                  type === t.value
                    ? typeToneSelected(t.value)
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Часов"
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0–24"
          hint="Максимум 24 часа в день"
          error={
            hours.length > 0 && (!Number.isFinite(hoursNum) || hoursNum > 24 || hoursNum <= 0)
              ? 'Должно быть от 0 до 24'
              : undefined
          }
        />

        {type !== 'work' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Комментарий</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder={type === 'idle' ? 'Причина простоя' : 'Что ремонтировалось'}
              className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function typeToneSelected(t: WorkDayType): string {
  switch (t) {
    case 'work':
      return 'border-emerald-600 bg-emerald-50 text-emerald-900';
    case 'idle':
      return 'border-amber-600 bg-amber-50 text-amber-900';
    case 'repair':
      return 'border-red-600 bg-red-50 text-red-900';
    default:
      return 'border-sky-600 bg-sky-50 text-sky-900';
  }
}
