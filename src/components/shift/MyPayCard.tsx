import { Card } from '@/components/ui/Card';
import type { Shift } from '@/types/shift';

/**
 * Read-only расчёт оплаты ДЛЯ САМОГО ВОДИТЕЛЯ (его вахта).
 *
 * Зеркало operator-PayBlock из VerifyShiftPage, но БЕЗ редактирования —
 * водитель только видит свою сумму. Бэк отдаёт поля оплаты только по своим
 * вахтам (`/api/shifts/my`, `/:id`, `driver-home`); чужие → 403, ставку продажи
 * (sell_rate) бэк водителю вырезает.
 *
 * Итог к выплате = ТРУД (`totalPay`) + РЕМОНТ (`repairTotal`) + СУТОЧНЫЕ
 * (`perDiemTotal`) − УДЕРЖАНИЕ/штраф (`deduction`). Каждое — отдельной строкой.
 * Часы ремонта НЕ входят в оплату труда — отдельная ставка ремонта.
 *
 * Состояния (по убыванию готовности):
 *   - есть посчитанная сумма → крупный итог + расшифровка;
 *   - вахта закрыта, но сумм нет → «оператор ещё считает»;
 *   - вахта активна → ставка-отпечаток + что итог будет после закрытия;
 *   - вообще нет данных оплаты → не рендерим.
 */
export function MyPayCard({ shift }: { shift: Shift }) {
  const snapshot = shift.hourlyRate ?? null;
  const override = shift.rateOverride ?? null;
  const effRate = override != null ? override : snapshot;
  const bonus = shift.rateBonus ?? 0;
  const hours = shift.totalWorked ?? null;
  const total = shift.totalPay ?? null; // оплата труда
  const perDiem = shift.perDiemTotal ?? 0; // суточные
  const perDiemDays = shift.perDiemDays ?? null;
  const perDiemRate = shift.perDiemRate ?? null;
  const repairTotal = shift.repairTotal ?? 0; // ремонт (отдельная ставка)
  const repairHours = shift.repairHours ?? null;
  const repairRate = shift.repairRate ?? null;
  const deduction = shift.deduction ?? 0; // удержание / штраф (минус)
  const deductionNote = shift.deductionNote ?? null;
  const grand = (total ?? 0) + perDiem + repairTotal - deduction;
  const closed = shift.status === 'pending_verification' || shift.status === 'verified';

  // Нечего показывать — не засоряем экран.
  if (snapshot == null && total == null && !bonus && perDiem <= 0 && repairTotal <= 0 && deduction <= 0)
    return null;

  const laborParts: string[] = [];
  if (hours != null && effRate != null && hours > 0) {
    laborParts.push(`${hours} ч × ${fmtMoney(effRate)} ₽/час`);
  }
  if (bonus > 0) laborParts.push(`надбавка ${fmtMoney(bonus)} ₽`);

  const hasSum = total != null || perDiem > 0 || repairTotal > 0 || deduction > 0;

  return (
    <Card padded className="space-y-3">
      <div className="text-base font-semibold text-ink-900">Моя оплата</div>

      {hasSum ? (
        <>
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-ink-500">К выплате</div>
            <div className="text-3xl font-bold text-brand-800">{fmtMoney(grand)} ₽</div>

            <div className="mt-2 space-y-1 text-sm text-ink-700">
              {total != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    Работа
                    {laborParts.length > 0 && (
                      <span className="text-ink-500"> · {laborParts.join(' + ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{fmtMoney(total)} ₽</span>
                </div>
              )}
              {repairTotal > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    Ремонт
                    {repairHours != null && repairRate != null && (
                      <span className="text-ink-500">
                        {' '}· {repairHours} ч × {fmtMoney(repairRate)} ₽
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{fmtMoney(repairTotal)} ₽</span>
                </div>
              )}
              {perDiem > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    Суточные
                    {perDiemDays != null && perDiemRate != null && (
                      <span className="text-ink-500">
                        {' '}· {perDiemDays} сут. × {fmtMoney(perDiemRate)} ₽
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{fmtMoney(perDiem)} ₽</span>
                </div>
              )}
              {deduction > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-red-700">
                  <span>
                    Удержание
                    {deductionNote && <span className="text-red-500"> · {deductionNote}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">− {fmtMoney(deduction)} ₽</span>
                </div>
              )}
            </div>

            {shift.payNote && (
              <div className="mt-1 text-xs text-ink-500">надбавка: {shift.payNote}</div>
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
          <span className="text-ink-500">Итог посчитается после закрытия и проверки вахты.</span>
        </div>
      )}
    </Card>
  );
}

/**
 * Короткая сумма «к выплате» для списка закрытых вахт = труд + ремонт + суточные −
 * удержание (или null, если ничего не посчитано).
 */
export function payShort(shift: Shift): string | null {
  const total = shift.totalPay;
  const perDiem = shift.perDiemTotal ?? 0;
  const repairTotal = shift.repairTotal ?? 0;
  const deduction = shift.deduction ?? 0;
  if (total == null && perDiem <= 0 && repairTotal <= 0 && deduction <= 0) return null;
  return `${fmtMoney((total ?? 0) + perDiem + repairTotal - deduction)} ₽`;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
}
