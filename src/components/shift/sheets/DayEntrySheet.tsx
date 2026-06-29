import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { workDaysApi } from '@/api/endpoints/workDays';
import { ApiError, describeError } from '@/api/errors';
import { cn } from '@/lib/cn';
import type { WorkDayType } from '@/types/workDay';

/**
 * Шторка «Добавить часы» с главного экрана водителя.
 *
 * День = рабочие часы (`hours`, оплата труда) И/ИЛИ часы ремонта (`repairHours`,
 * оплачиваются отдельно по ставке ремонта). Можно внести оба в одном дне.
 * Тип Работа/Простой относится к рабочим часам; ремонт — отдельное поле.
 *
 * Бэк-валидации (на проде): часы 0…24 (и рабочие, и ремонт); дубль дня → 409.
 * Дата по умолчанию = сегодня, можно выбрать прошедшую (забыл внести).
 */
const TYPES: { value: WorkDayType; label: string }[] = [
  { value: 'work', label: 'Работа' },
  { value: 'idle', label: 'Простой' },
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
  const [repair, setRepair] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursNum = hours.trim() === '' ? 0 : Number(hours);
  const repairNum = repair.trim() === '' ? 0 : Number(repair);
  const hoursOk = Number.isFinite(hoursNum) && hoursNum >= 0 && hoursNum <= 24;
  const repairOk = Number.isFinite(repairNum) && repairNum >= 0 && repairNum <= 24;
  const atLeastOne = hoursNum > 0 || repairNum > 0;
  const valid = !!date && hoursOk && repairOk && atLeastOne;

  function reset() {
    setDate(defaultDate);
    setType('work');
    setHours('');
    setRepair('');
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
        repairHours: repairNum,
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

  const fieldCls =
    'w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600';

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (saving) return;
        reset();
        onClose();
      }}
      title="Добавить часы"
      description="Рабочие часы и/или ремонт за день"
      footer={
        <Button fullWidth size="xl" loading={saving} disabled={!valid} onClick={handleSave}>
          Сохранить день
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">За какой день</label>
          <input
            type="date"
            value={date}
            max={defaultDate}
            onChange={(e) => setDate(e.target.value)}
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-ink-500">
            По умолчанию сегодня. Не успели внести вовремя — выберите прошедший день.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Тип дня</p>
          <div className="grid grid-cols-2 gap-2">
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
          label={type === 'idle' ? 'Часы простоя' : 'Рабочие часы'}
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0–24"
          error={hours.length > 0 && !hoursOk ? 'От 0 до 24' : undefined}
        />

        <Input
          label="Часы ремонта (если был)"
          value={repair}
          onChange={(e) => setRepair(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0–24"
          hint="Считаются отдельно — по ставке ремонта, не как рабочие"
          error={repair.length > 0 && !repairOk ? 'От 0 до 24' : undefined}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Комментарий</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={
              repairNum > 0 ? 'Что ремонтировалось' : type === 'idle' ? 'Причина простоя' : 'Необязательно'
            }
            className={fieldCls}
          />
        </div>

        {!atLeastOne && (hours.length > 0 || repair.length > 0) && (
          <p className="text-xs text-ink-500">Укажите рабочие часы или часы ремонта (хотя бы одно &gt; 0).</p>
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
    default:
      return 'border-brand-600 bg-brand-50 text-brand-900';
  }
}
