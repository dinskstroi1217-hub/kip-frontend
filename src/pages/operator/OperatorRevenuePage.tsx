import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { shiftsApi } from '@/api/endpoints/shifts';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift } from '@/types/shift';

/**
 * Отчёт выручки (только оператор) — за месяц, по контрагенту → объекту → технике:
 * сколько часов отработано и сколько заработали (выручка = часы × ставка продажи).
 * Плюс зарплата и маржа (выручка − зарплата) для владельца.
 * Данные: shiftsApi.list() (все вахты, фильтр пересечения с месяцем на клиенте).
 * Ставка продажи/выручка — операторские данные, водителю бэк их не отдаёт.
 */

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

interface Row {
  id: string;
  counterparty: string;
  object: string;
  equipment: string;
  hours: number;
  sellRate: number | null;
  revenue: number;
  pay: number;
  margin: number;
}
interface Group { name: string; rows: Row[]; hours: number; revenue: number; pay: number; margin: number }

export function OperatorRevenuePage() {
  const shifts = useAsync(() => shiftsApi.list(), []);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStart = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-01`;
  const monthEnd = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const { groups, grand } = useMemo(() => {
    const inMonth = (s: Shift) => s.startDate <= monthEnd && (s.endDateActual ?? s.endDatePlanned ?? s.startDate) >= monthStart;
    const rows: Row[] = (shifts.data ?? [])
      .filter((s) => inMonth(s) && (s.totalWorked ?? 0) > 0)
      .map((s) => {
        const hours = s.totalWorked ?? 0;
        const sellRate = s.sellRate ?? null;
        const revenue = Math.round((sellRate ?? 0) * hours);
        const pay = s.totalPay ?? 0;
        return {
          id: s.id,
          counterparty: s.counterpartyName || '— без контрагента',
          object: s.siteName || '—',
          equipment: s.equipmentRegNumber || s.equipmentName || '—',
          hours,
          sellRate,
          revenue,
          pay,
          margin: revenue - pay,
        };
      })
      .sort((a, b) => a.counterparty.localeCompare(b.counterparty, 'ru') || a.equipment.localeCompare(b.equipment, 'ru'));

    const map = new Map<string, Row[]>();
    for (const r of rows) { if (!map.has(r.counterparty)) map.set(r.counterparty, []); map.get(r.counterparty)!.push(r); }
    const groups: Group[] = Array.from(map.entries()).map(([name, rs]) => ({
      name,
      rows: rs,
      hours: rs.reduce((s, r) => s + r.hours, 0),
      revenue: rs.reduce((s, r) => s + r.revenue, 0),
      pay: rs.reduce((s, r) => s + r.pay, 0),
      margin: rs.reduce((s, r) => s + r.margin, 0),
    }));
    const grand = {
      hours: rows.reduce((s, r) => s + r.hours, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      pay: rows.reduce((s, r) => s + r.pay, 0),
      margin: rows.reduce((s, r) => s + r.margin, 0),
      count: rows.length,
    };
    return { groups, grand };
  }, [shifts.data, monthStart, monthEnd]);

  const prev = () => setYm((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const next = () => setYm((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/operator" className="text-sm text-brand-700 underline">← К дашборду</Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={prev} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">←</button>
          <div className="min-w-[150px] text-center text-base font-semibold text-ink-900">{MONTHS[ym.m]} {ym.y}</div>
          <button type="button" onClick={next} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">→</button>
          {!isCurrent && <button type="button" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100">сегодня</button>}
        </div>
      </div>

      <Section title="Отчёт выручки" description="За месяц: по контрагенту → объекту → технике — часы, выручка (часы × ставка продажи), зарплата и маржа. Выручку и ставку продажи видит только диспетчер.">
        {shifts.isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : shifts.error ? (
          <ErrorState title="Не удалось загрузить" message={describeError(shifts.error)} onRetry={shifts.refetch} />
        ) : groups.length === 0 ? (
          <Card padded><EmptyState title="Нет данных за месяц" description="Нет вахт с отработанными часами в этом месяце. Часы появляются после внесения дней водителем." /></Card>
        ) : (
          <Card className="overflow-x-auto">
            <div className="border-b border-ink-100 bg-emerald-50 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-2xl font-bold text-emerald-800">{fmtMoney(grand.revenue)} ₽</span>
                <span className="text-sm text-ink-600">выручка · {fmtHours(grand.hours)} ч · {grand.count} вахт</span>
                <span className="ml-auto text-sm text-ink-600">зарплата {fmtMoney(grand.pay)} ₽ · маржа <b className="text-ink-900">{fmtMoney(grand.margin)} ₽</b></span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Объект</th>
                  <th className="px-3 py-2 text-left font-medium">Техника</th>
                  <th className="px-3 py-2 text-right font-medium">Часы</th>
                  <th className="px-3 py-2 text-right font-medium">Ставка прод.</th>
                  <th className="px-3 py-2 text-right font-medium">Выручка</th>
                  <th className="px-3 py-2 text-right font-medium">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupBlock key={g.name} group={g} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}

function GroupBlock({ group }: { group: Group }) {
  return (
    <>
      <tr className="border-t border-ink-200 bg-ink-50/70">
        <td className="px-3 py-2 font-semibold text-ink-900" colSpan={6}>{group.name}</td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.id} className="border-t border-ink-100">
          <td className="px-3 py-2 text-ink-700">{r.object}</td>
          <td className="px-3 py-2">
            <Link to={`/operator/shift/${r.id}`} className="text-brand-700 underline">{r.equipment}</Link>
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-ink-800">{fmtHours(r.hours)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-ink-800">{r.sellRate != null ? fmtMoney(r.sellRate) : <span className="text-amber-700">не задана</span>}</td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-800">{fmtMoney(r.revenue)} ₽</td>
          <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtMoney(r.margin)} ₽</td>
        </tr>
      ))}
      <tr className="border-t border-ink-100 bg-emerald-50/40">
        <td className="px-3 py-1.5 text-xs uppercase tracking-wide text-ink-500" colSpan={2}>Итого по «{group.name}»</td>
        <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-ink-700">{fmtHours(group.hours)}</td>
        <td />
        <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-emerald-800">{fmtMoney(group.revenue)} ₽</td>
        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink-600">{fmtMoney(group.margin)} ₽</td>
      </tr>
    </>
  );
}

function fmtMoney(n: number): string { return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)); }
function fmtHours(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
