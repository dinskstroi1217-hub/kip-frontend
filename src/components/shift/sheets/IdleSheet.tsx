import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { workDaysApi } from '@/api/endpoints/workDays';
import { describeError } from '@/api/errors';
import type { IdleReason, WorkDay } from '@/types/workDay';

/**
 * Простой. Фиксируется как work-day с типом 'idle'.
 * Также бэк автоматически создаёт «карточку у оператора» 🔴 и шлёт MAX-уведомление.
 */

interface IdleSheetProps {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  onSuccess: (day: WorkDay) => void;
}

const REASONS: { value: IdleReason; label: string }[] = [
  { value: 'weather', label: 'Погода' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'external', label: 'Сторонняя поломка' },
  { value: 'other', label: 'Прочее' },
];

export function IdleSheet({ open, onClose, shiftId, onSuccess }: IdleSheetProps) {
  const [reason, setReason] = useState<IdleReason | null>(null);
  const [hours, setHours] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursNum = Number(hours);
  const valid =
    reason !== null && Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24 && comment.trim().length >= 3;

  function reset() {
    setReason(null);
    setHours('');
    setComment('');
    setError(null);
  }

  async function handleSubmit() {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const day = await workDaysApi.create({
        shiftId,
        date: new Date().toISOString().slice(0, 10),
        type: 'idle',
        hours: hoursNum,
        idleReason: reason ?? undefined,
        comment: comment.trim(),
      });
      onSuccess(day);
      reset();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (submitting) return;
        reset();
        onClose();
      }}
      title="Зафиксировать простой"
      description="Оператор получит уведомление сразу"
      footer={
        <Button fullWidth size="xl" loading={submitting} disabled={!valid} onClick={handleSubmit}>
          Сохранить простой
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Причина</p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={cn(
                  'min-h-tap rounded-lg border-2 px-3 py-2.5 text-base font-medium transition-colors',
                  reason === r.value
                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Часов простоя"
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="Напр., 4"
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Комментарий
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Что произошло?"
            className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
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
