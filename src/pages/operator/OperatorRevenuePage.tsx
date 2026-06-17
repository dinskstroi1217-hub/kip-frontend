import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { shiftsApi } from '@/api/endpoints/shifts';
import { equipmentApi } from '@/api/endpoints/equipment';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift } from '@/types/shift';

/**
 * Финотчёт (только оператор) — отдельная вкладка, чтобы не засорять доску-канбан.
 * За месяц:
 *   - факт: по контрагенту → объекту → технике — часы, выручка (часы × ставка
 *     продажи), зарплата и маржа, с итогами;
 *   - прогноз на месяц из текущей загрузки (активные+плановые вахты × ч/день);
 *   - печать (window.print) и выгрузка в Excel (CSV, UTF-8 BOM, ; — для рус. Excel).
 * Данные: shiftsApi.list() + equipmentApi.list() (фильтр пересечения с месяцем на
 * клиенте). Ставка продажи/выручка — операторские данные, водителю не отдаются.
 */

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

interface Row { id: string; counterparty: string; object: string; equipment: string; hours: number; sellRate: number | null; revenue: number; pay: number; margin: number }
interface Group { name: string; rows: Row[]; hours: number; revenue: number; pay: number; margin: number }

export function OperatorRevenuePage() {
  const shifts = useAsync(() => shiftsApi.list(), []);
  const equipment = useAsync(() => equipmentApi.list(), []);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [hpd, setHpd] = useState(10);

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
        return { id: s.id, counterparty: s.counterpartyName || '— без контрагента', object: s.siteName || '—', equipment: s.equipmentRegNumber || s.equipmentName || '—', hours, sellRate, revenue, pay, margin: revenue - pay };
      })
      .sort((a, b) => a.counterparty.localeCompare(b.counterparty, 'ru') || a.equipment.localeCompare(b.equipment, 'ru'));
    const map = new Map<string, Row[]>();
    for (const r of rows) { if (!map.has(r.counterparty)) map.set(r.counterparty, []); map.get(r.counterparty)!.push(r); }
    const groups: Group[] = Array.from(map.entries()).map(([name, rs]) => ({
      name, rows: rs,
      hours: rs.reduce((s, r) => s + r.hours, 0), revenue: rs.reduce((s, r) => s + r.revenue, 0),
      pay: rs.reduce((s, r) => s + r.pay, 0), margin: rs.reduce((s, r) => s + r.margin, 0),
    }));
    const grand = {
      hours: rows.reduce((s, r) => s + r.hours, 0), revenue: rows.reduce((s, r) => s + r.revenue, 0),
      pay: rows.reduce((s, r) => s + r.pay, 0), margin: rows.reduce((s, r) => s + r.margin, 0), count: rows.length,
    };
    return { groups, grand };
  }, [shifts.data, monthStart, monthEnd]);

  // Прогноз на месяц из текущей загрузки: активные+плановые вахты, накрывающие месяц.
  const forecast = useMemo(() => {
    const machines = Math.max(1, (equipment.data ?? []).length);
    const capacity = machines * daysInMonth;
    let bookedDays = 0;
    let projRevenue = 0;
    for (const s of shifts.data ?? []) {
      if (s.status === 'verified') continue; // закрытые — это факт, не прогноз
      const end = s.endDateActual ?? s.endDatePlanned ?? s.startDate;
      if (s.startDate > monthEnd || end < monthStart) continue;
      const d = overlapDays(s.startDate, end, monthStart, monthEnd);
      bookedDays += d;
      projRevenue += d * hpd * (s.sellRate ?? 0);
    }
    return { load: Math.round((bookedDays / capacity) * 100), projRevenue: Math.round(projRevenue), bookedDays };
  }, [equipment.data, shifts.data, monthStart, monthEnd, daysInMonth, hpd]);

  const prev = () => setYm((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const next = () => setYm((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  const exportCsv = () => {
    const sep = ';';
    const head = ['Контрагент', 'Объект', 'Техника', 'Часы', 'Ставка продажи', 'Выручка', 'Зарплата', 'Маржа'];
    const lines = [head.join(sep)];
    for (const g of groups) for (const r of g.rows) {
      lines.push([g.name, r.object, r.equipment, r.hours, r.sellRate ?? '', r.revenue, r.pay, r.margin].map(csvCell).join(sep));
    }
    lines.push(['ИТОГО', '', '', grand.hours, '', grand.revenue, grand.pay, grand.margin].map(csvCell).join(sep));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finotchet-${ym.y}-${String(ym.m + 1).padStart(2, '0')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <style>{`@media print { .no-print { display: none !important; } .fin-print-only { display: block !important; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/operator" className="text-sm text-brand-700 underline">← К дашборду</Link>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={prev} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">←</button>
          <div className="min-w-[140px] text-center text-base font-semibold text-ink-900">{MONTHS[ym.m]} {ym.y}</div>
          <button type="button" onClick={next} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">→</button>
          {!isCurrent && <button type="button" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100">сегодня</button>}
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">🖨 Печать</button>
          <button type="button" onClick={exportCsv} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">⬇ Excel</button>
        </div>
      </div>

      <div className="fin-print-only hidden text-lg font-semibold text-ink-900">Финотчёт — {MONTHS[ym.m]} {ym.y}</div>

      {/* Прогноз на месяц из текущей загрузки */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Факт выручка" value={`${fmtMoney(grand.revenue)} ₽`} tone="emerald" />
        <MetricCard label="Маржа (факт)" value={`${fmtMoney(grand.margin)} ₽`} tone="ink" />
        <MetricCard label={`Прогноз за месяц ≈`} value={`${fmtMoney(forecast.projRevenue)} ₽`} tone="emerald" />
        <MetricCard label="Загрузка месяца" value={`${forecast.load}%`} tone={forecast.load < 50 ? 'amber' : 'ink'} />
      </div>
      <div className="no-print flex items-center gap-2 text-sm text-ink-500">
        <span>Прогноз из текущей загрузки при</span>
        <input type="number" min={1} max={24} value={hpd} onChange={(e) => setHpd(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm" />
        <span>ч/день · законтрактовано {forecast.bookedDays} машино-дней</span>
      </div>

      <Section title="Финотчёт по выручке" description="Факт за месяц: контрагент → объект → техника — часы, выручка (часы × ставка продажи), зарплата и маржа. Выручку/ставку продажи видит только диспетчер.">
        {shifts.isLoading || equipment.isLoading ? (
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
                {groups.map((g) => <GroupBlock key={g.name} group={g} />)}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'ink' }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-600' : 'text-ink-900';
  return (
    <div className="rounded-xl bg-ink-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className={'mt-1 text-xl font-bold tabular-nums ' + c}>{value}</div>
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
          <td className="px-3 py-2"><Link to={`/operator/shift/${r.id}`} className="text-brand-700 underline">{r.equipment}</Link></td>
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

function overlapDays(startISO: string, endISO: string, monthStartISO: string, monthEndISO: string): number {
  const s = startISO > monthStartISO ? startISO : monthStartISO;
  const e = endISO < monthEndISO ? endISO : monthEndISO;
  const sd = new Date(s + 'T00:00:00');
  const ed = new Date(e + 'T00:00:00');
  const diff = Math.round((ed.getTime() - sd.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}
function csvCell(v: unknown): string { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function fmtMoney(n: number): string { return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)); }
function fmtHours(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
