import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { employeesApi } from '@/api/endpoints/employees';
import { shiftsApi } from '@/api/endpoints/shifts';
import type { Shift } from '@/types/shift';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';

/**
 * Вин-отчёт по водителю (только оператор) — сводка к выплате за период.
 *
 * Логика:
 *   - выбираем водителя (employees с role=driver) + период (даты);
 *   - тянем его вахты GET /api/shifts?driver_id&from&to (operator-only);
 *   - по каждой: подтверждённые часы × ставка (override ?? отпечаток) + надбавка;
 *   - снизу — ИТОГО к выплате.
 *
 * Ставка/надбавка задаются на экране проверки вахты; здесь только сводка.
 * Архивные вахты считаются по своей замороженной ставке-отпечатку.
 */
export function OperatorPayrollPage() {
  const employees = useAsync(() => employeesApi.list(), []);
  const drivers = useMemo(
    () =>
      (employees.data ?? [])
        .filter((e) => e.role === 'driver')
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
    [employees.data],
  );

  const [driverId, setDriverId] = useState<number | ''>('');
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());

  const shifts = useAsync(
    () => (driverId === '' ? Promise.resolve([]) : shiftsApi.list({ driverId, from, to })),
    [driverId, from, to],
  );

  const rows = useMemo(
    () =>
      (shifts.data ?? [])
        .slice()
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1)),
    [shifts.data],
  );
  // B2: итог к выплате — единый net_pay с бэка (труд+суточные+ремонт−удержание), НЕ только труд.
  // Фолбэк на локальный расчёт, если бэк ещё не проставил netPay (старые вахты).
  const netOf = (r: Shift): number =>
    r.netPay ?? (r.totalPay ?? 0) + (r.perDiemTotal ?? 0) + (r.repairTotal ?? 0) - (r.deduction ?? 0);
  const totalNet = rows.reduce((s, r) => s + netOf(r), 0);
  const totalLabor = rows.reduce((s, r) => s + (r.totalPay ?? 0), 0);
  const totalPerDiem = rows.reduce((s, r) => s + (r.perDiemTotal ?? 0), 0);
  const totalRepair = rows.reduce((s, r) => s + (r.repairTotal ?? 0), 0);
  const totalDeduction = rows.reduce((s, r) => s + (r.deduction ?? 0), 0);
  const totalHours = rows.reduce((s, r) => s + (r.totalWorked ?? 0), 0);
  const selectedDriver = drivers.find((d) => d.id === driverId);

  return (
    <div className="space-y-5">
      <Link to="/operator" className="text-sm text-brand-700 underline">
        ← К дашборду
      </Link>

      <Section
        title="Расчёт по водителю"
        description="Сводка к выплате за период: подтверждённые часы × ставка вахты + надбавки. Ставка у каждой вахты заморожена на старте — изменение тарифа не меняет прошлые вахты."
      >
        <Card padded className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-ink-500">Водитель</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                <option value="">— выбери водителя —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                    {d.hourlyRate != null ? ` (${fmtMoney(d.hourlyRate)} ₽/час)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-ink-500">С даты</label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-ink-500">По дату</label>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>
        </Card>
      </Section>

      {driverId === '' ? (
        <Card padded>
          <EmptyState title="Выбери водителя" description="Сверху выбери водителя и период — покажу его вахты и сумму к выплате." />
        </Card>
      ) : employees.isLoading || shifts.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : shifts.error ? (
        <ErrorState title="Не удалось загрузить" message={describeError(shifts.error)} onRetry={shifts.refetch} />
      ) : rows.length === 0 ? (
        <Card padded>
          <EmptyState title="Нет вахт за период" description="У этого водителя нет вахт в выбранном диапазоне дат." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-100 bg-brand-50 px-4 py-3">
            <div className="text-sm text-ink-600">
              {selectedDriver?.fullName} · {from} → {to}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-2xl font-bold text-brand-800">{fmtMoney(totalNet)} ₽</span>
              <span className="text-sm text-ink-500">
                к выплате · {fmtHours(totalHours)} ч · {rows.length} вахт
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-500">
              труд {fmtMoney(totalLabor)} ₽
              {totalPerDiem > 0 ? ` + суточные ${fmtMoney(totalPerDiem)} ₽` : ''}
              {totalRepair > 0 ? ` + ремонт ${fmtMoney(totalRepair)} ₽` : ''}
              {totalDeduction > 0 ? ` − удержание ${fmtMoney(totalDeduction)} ₽` : ''}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Вахта / период</th>
                <th className="px-3 py-2 text-right font-medium">Часы</th>
                <th className="px-3 py-2 text-right font-medium">Труд</th>
                <th className="px-3 py-2 text-right font-medium">Суточные</th>
                <th className="px-3 py-2 text-right font-medium">Ремонт</th>
                <th className="px-3 py-2 text-right font-medium">Удержание</th>
                <th className="px-3 py-2 text-right font-medium">К выплате</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const effRate = r.rateOverride ?? r.hourlyRate ?? null;
                return (
                  <tr key={r.id} className="border-t border-ink-100 align-top">
                    <td className="px-3 py-2.5">
                      <Link to={`/operator/shift/${r.id}`} className="font-medium text-brand-700 underline">
                        №{r.id}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {r.siteName ?? '—'} · {r.startDate} → {r.endDateActual ?? r.endDatePlanned ?? '—'}
                      </div>
                      {r.payNote && <div className="mt-0.5 text-xs text-ink-400">↳ {r.payNote}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-800">
                      {r.totalWorked != null ? fmtHours(r.totalWorked) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-800">
                      {r.totalPay != null ? `${fmtMoney(r.totalPay)}` : '—'}
                      {effRate != null && (
                        <div className="text-[10px] text-ink-400">
                          {fmtMoney(effRate)} ₽/ч
                          {r.rateOverride != null && r.rateOverride !== r.hourlyRate ? ' ↑' : ''}
                          {r.rateBonus ? ` +${fmtMoney(r.rateBonus)}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {r.perDiemTotal ? fmtMoney(r.perDiemTotal) : '—'}
                      {r.perDiemTotal ? <div className="text-[10px] text-ink-400">{r.perDiemDays ?? 0} сут</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {r.repairTotal ? fmtMoney(r.repairTotal) : '—'}
                      {r.repairTotal ? <div className="text-[10px] text-ink-400">{r.repairHours ?? 0} ч</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                      {r.deduction ? `−${fmtMoney(r.deduction)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand-800">
                      {fmtMoney(netOf(r))} ₽
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-200 bg-ink-50">
                <td className="px-3 py-2.5 font-semibold text-ink-900">ИТОГО к выплате</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink-900">
                  {fmtHours(totalHours)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{fmtMoney(totalLabor)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">
                  {totalPerDiem ? fmtMoney(totalPerDiem) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">
                  {totalRepair ? fmtMoney(totalRepair) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                  {totalDeduction ? `−${fmtMoney(totalDeduction)}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums text-brand-800">
                  {fmtMoney(totalNet)} ₽
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
}

function fmtHours(n: number): string {
  // часы могут быть дробными — показываем без лишних нулей
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
