import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { workDaysApi } from '@/api/endpoints/workDays';
import { describeError } from '@/api/errors';
import { cn } from '@/lib/cn';
import type { WorkDay, WorkDayType } from '@/types/workDay';

/**
 * Правка уже сохранённого дня (онлайн-PATCH через workDaysApi.update).
 * Бэк разрешает правку, пока вахта active И день не approved — иначе 400,
 * показываем сообщение. Дату не меняем (день привязан к дате).
 *
 * `day === null` → шторка закрыта.
 */
const TYPES: { value: WorkDayType; label: string }[] = [
  { value: 'work', label: 'Работа' },
  { value: 'idle', label: 'Простой' },
];

interface EditDaySheetProps {
  day: WorkDay | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDaySheet({ day, onClose, onSaved }: EditDaySheetProps) {
  const [type, setType] = useState<WorkDayType>('work');
  const [hours, setHours] = useState('');
  const [repair, setRepair] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При открытии дня — заполняем поля его текущими значениями.
  useEffect(() => {
    if (!day) return;
    setType(day.type === 'idle' ? 'idle' : 'work');
    setHours(day.hours > 0 ? String(day.hours) : '');
    setRepair((day.repairHours ?? 0) > 0 ? String(day.repairHours) : '');
    setComment(day.comment ?? '');
    setError(null);
  }, [day]);

  const hoursNum = hours.trim() === '' ? 0 : Number(hours);
  const repairNum = repair.trim() === '' ? 0 : Number(repair);
  const hoursOk = Number.isFinite(hoursNum) && hoursNum >= 0 && hoursNum <= 24;
  const repairOk = Number.isFinite(repairNum) && repairNum >= 0 && repairNum <= 24;
  const valid = hoursOk && repairOk && (hoursNum > 0 || repairNum > 0);

  async function handleSave() {
    if (!day || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await workDaysApi.update(day.id, {
        type,
        hours: hoursNum,
        repairHours: repairNum,
        comment: comment.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    'w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600';

  return (
    <BottomSheet
      open={day != null}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      title="Изменить день"
      description={day ? format(new Date(day.date), 'd MMMM yyyy', { locale: ru }) : ''}
      footer={
        <Button fullWidth size="xl" loading={saving} disabled={!valid} onClick={handleSave}>
          Сохранить изменения
        </Button>
      }
    >
      <div className="space-y-4">
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
                    ? t.value === 'idle'
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-emerald-600 bg-emerald-50 text-emerald-900'
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
          hint="Считаются отдельно — по ставке ремонта"
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

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
