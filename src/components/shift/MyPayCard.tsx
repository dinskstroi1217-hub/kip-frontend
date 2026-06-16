import { Card } from '@/components/ui/Card';
import type { Shift } from '@/types/shift';

/**
 * Read-only расчёт оплаты ДЛЯ САМОГО ВОДИТЕЛЯ (его вахта).
 *
 * Зеркало operator-PayBlock из VerifyShiftPage, но БЕЗ редактирования —
 * водитель только видит свою сумму. Бэк отдаёт поля оплаты только по своим
 * вахтам (`/api/shifts/my`, `/api/shifts/:id` для своих); чужие → 403, поэтому
 * чужую ставку/сумму водитель увидеть не может.
 *
 * Состояния (по убыванию готовности):
 *   - totalPay задан (оператор посчитал) → крупная «К выплате» + расшифровка;
 *   - вахта закрыта, но totalPay нет → «оператор ещё считает»;
 *   - вахта активна → показываем ставку-отпечаток + что итог будет после закрытия;
 *   - вообще нет данных оплаты (старая вахта / ставка не задана) → не рендерим.
 */
export function MyPayCard({ shift }: { shift: Shift }) {
  const snapshot = shift.hourlyRate ?? null;
  const override = shift.rateOverride ?? null;
  const effRate = override != null ? override : snapshot;
  const bonus = shift.rateBonus ?? 0;
  const hours = shift.totalWorked ?? null;
  const total = shift.totalPay ?? null;
  const closed = shift.status === 'pending_verification' || shift.status === 'verified';

  // Нечего показывать — не засоряем экран.
  if (snapshot == null && total == null && !bonus) return null;

  const breakdown: string[] = [];
  if (hours != null && effRate != null && hours > 0) {
    breakdown.push(`${hours} ч × ${fmtMoney(effRate)} ₽/час`);
  }
  if (bonus > 0) breakdown.push(`надбавка ${fmtMoney(bonus)} ₽`);

  return (
    <Card padded className="space-y-3">
      <div className="text-base font-semibold text-ink-900">Моя оплата</div>

      {total != null ? (
        <>
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-ink-500">К выплате</div>
            <div className="text-3xl font-bold text-brand-800">{fmtMoney(total)} ₽</div>
            {breakdown.length > 0 && (
              <div className="mt-1 text-sm text-ink-600">{breakdown.join(' + ')}</div>
            )}
            {shift.payNote && (
              <div className="mt-0.5 text-xs text-ink-500">надбавка: {shift.payNote}</div>
            )}
          </div>
          {shift.status === 'pending_verification' && (
            <p className="text-xs text-ink-500">
              Предварительно — сумма может измениться после проверки оператором.
            </p>
          )}
        </>
      ) : closed ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Вахта на проверке у оператора. Итоговую сумму увидишь, когда он её посчитает.
          {effRate != null && (
            <>
              {' '}Твоя ставка: <b>{fmtMoney(effRate)} ₽/час</b>.
            </>
          )}
        </div>
      ) : (
        <div className="text-sm text-ink-700">
          {effRate != null && (
            <>
              Ставка по вахте: <b>{fmtMoney(effRate)} ₽/час</b>.{' '}
            </>
          )}
          <span className="text-ink-500">
            Итог посчитается после закрытия и проверки вахты.
          </span>
        </div>
      )}
    </Card>
  );
}

/** Короткая сумма «к выплате» для списка закрытых вахт (или null если не посчитана). */
export function payShort(shift: Shift): string | null {
  return shift.totalPay != null ? `${fmtMoney(shift.totalPay)} ₽` : null;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
}
