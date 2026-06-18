import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { shiftsApi } from '@/api/endpoints/shifts';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift, ShiftStatus } from '@/types/shift';
import type { Equipment } from '@/types/equipment';

/**
 * Доска-график вахт (только оператор). Канбан-подобный месячный таймлайн:
 *   - по горизонтали — дни месяца;
 *   - строки — машины (сортировка по госномеру);
 *   - полоса = вахта (от старта до конца), подпись = водитель, клик → проверка;
 *   - внизу КРАСНЫМИ строками — машины в простое (нет активной вахты на сегодня;
 *     для прошлых/будущих месяцев — нет вахт в этом месяце вообще).
 *
 * Данные: equipmentApi.list() (все машины) + shiftsApi.list() (все вахты, фильтр
 * пересечения с месяцем на клиенте — бэк ?from&to отдаёт только вахты целиком
 * внутри периода, что обрезало бы вахты через границу месяца).
 */

const STATUS_BAR: Record<ShiftStatus, { bg: string; label: string }> = {
  free: { bg: 'bg-ink-300', label: 'свободна' },
  pending_acceptance: { bg: 'bg-sky-500', label: 'назначена' },
  active: { bg: 'bg-emerald-500', label: 'в работе' },
  issue_idle: { bg: 'bg-orange-500', label: 'простой' },
  issue_repair: { bg: 'bg-red-500', label: 'ремонт' },
  pending_verification: { bg: 'bg-amber-500', label: 'на проверке' },
  verified: { bg: 'bg-ink-400', label: 'закрыта' },
};

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

interface MachineRow {
  machine: Equipment;
  shifts: Shift[];
  idle: boolean;
}

export function OperatorBoardPage() {
  const now = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() }); // m 0-based
  const monthStr = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;

  // Перф: ОДИН агрегат /api/operator/board?month= (техника + вахты месяца) —
  // вместо 2 запросов и фильтрации всех вахт на клиенте. Перезапрос при смене месяца.
  const board = useAsync(() => shiftsApi.operatorBoard(monthStr), [monthStr]);

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const isCurrentMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const todayDay = isCurrentMonth ? now.getDate() : null;

  const monthStart = new Date(ym.y, ym.m, 1);
  const monthEnd = new Date(ym.y, ym.m, daysInMonth);
  const todayISO = isoOf(now);

  const rows: MachineRow[] = useMemo(() => {
    const machines = board.data?.equipment ?? [];
    const allShifts = board.data?.shifts ?? [];

    const byMachine = new Map<string | number, Shift[]>();
    for (const s of allShifts) {
      if (s.equipmentId == null) continue;
      const sStart = parseISO(s.startDate);
      const sEnd = parseISO(s.endDateActual ?? s.endDatePlanned ?? s.startDate);
      if (!sStart || !sEnd) continue;
      // пересечение с месяцем
      if (sEnd < monthStart || sStart > monthEnd) continue;
      const key = s.equipmentId;
      if (!byMachine.has(key)) byMachine.set(key, []);
      byMachine.get(key)!.push(s);
    }

    const result: MachineRow[] = machines.map((machine) => {
      const ms = byMachine.get(machine.id) ?? [];
      let idle: boolean;
      if (todayDay != null) {
        // текущий месяц: простой = нет НЕ закрытой вахты, накрывающей сегодня
        idle = !ms.some((s) => s.status !== 'verified' && covers(s, todayISO));
      } else {
        // другой месяц: простой = нет вахт в этом месяце
        idle = ms.length === 0;
      }
      return { machine, shifts: ms, idle };
    });

    const sortKey = (m: Equipment) => (m.regNumber?.trim() || m.name || String(m.id)).toLowerCase();
    const working = result.filter((r) => !r.idle).sort((a, b) => sortKey(a.machine).localeCompare(sortKey(b.machine), 'ru'));
    const idleRows = result.filter((r) => r.idle).sort((a, b) => sortKey(a.machine).localeCompare(sortKey(b.machine), 'ru'));
    return [...working, ...idleRows];
  }, [board.data, monthStart, monthEnd, todayDay, todayISO]);

  const idleCount = rows.filter((r) => r.idle).length;
  const workingCount = rows.length - idleCount;

  const prevMonth = () => setYm((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const nextMonth = () => setYm((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  const loading = board.isLoading;
  const error = board.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/operator" className="text-sm text-brand-700 underline">← К дашборду</Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">←</button>
          <div className="min-w-[150px] text-center text-base font-semibold text-ink-900">{MONTHS[ym.m]} {ym.y}</div>
          <button type="button" onClick={nextMonth} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm hover:bg-ink-50">→</button>
          {!isCurrentMonth && (
            <button type="button" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100">сегодня</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
        <span>🟢 в работе · 🔵 назначена · 🟡 на проверке · 🟠 простой/ремонт · ⬜ закрыта</span>
        <span className="ml-auto">Работают: <b className="text-emerald-700">{workingCount}</b> · В простое: <b className="text-red-600">{idleCount}</b></span>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : error ? (
        <ErrorState title="Не удалось загрузить доску" message={describeError(error)} onRetry={() => { void board.refetch(); }} />
      ) : rows.length === 0 ? (
        <Card padded><p className="text-sm text-ink-600">Нет техники для отображения.</p></Card>
      ) : (
        <Card className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Шапка дней */}
            <div className="flex border-b border-ink-200 bg-ink-50">
              <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold uppercase text-ink-500">
                Машина
              </div>
              <div className="flex flex-1">
                {days.map((d) => {
                  const dow = new Date(ym.y, ym.m, d).getDay(); // 0=вс,6=сб
                  const weekend = dow === 0 || dow === 6;
                  const isToday = d === todayDay;
                  return (
                    <div key={d} className={'flex-1 border-r border-ink-100 py-2 text-center text-[11px] tabular-nums ' + (isToday ? 'bg-brand-100 font-bold text-brand-800' : weekend ? 'bg-ink-100 text-ink-400' : 'text-ink-500')}>
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Строки машин */}
            {rows.map((row) => (
              <div key={row.machine.id} className={'flex border-b border-ink-100 ' + (row.idle ? 'bg-red-50' : 'hover:bg-ink-50/40')}>
                <div className={'sticky left-0 z-10 w-44 shrink-0 border-r border-ink-200 px-3 py-2 ' + (row.idle ? 'bg-red-50' : 'bg-white')}>
                  <div className={'truncate text-sm font-semibold ' + (row.idle ? 'text-red-700' : 'text-ink-900')}>
                    {row.machine.regNumber?.trim() || row.machine.name || `#${row.machine.id}`}
                  </div>
                  <div className="truncate text-[11px] text-ink-500">
                    {row.idle ? '⛔ простой' : (row.machine.name ?? '')}
                  </div>
                </div>
                <div className="relative flex flex-1" style={{ minHeight: 44 }}>
                  {/* фоновая сетка дней */}
                  {days.map((d) => {
                    const isToday = d === todayDay;
                    return <div key={d} className={'flex-1 border-r border-ink-100 ' + (isToday ? 'bg-brand-50' : '')} />;
                  })}
                  {/* полосы вахт */}
                  {row.shifts.map((s) => {
                    const geom = barGeom(s, ym.y, ym.m, daysInMonth);
                    if (!geom) return null;
                    const tone = STATUS_BAR[s.status] ?? STATUS_BAR.active;
                    return (
                      <Link
                        key={s.id}
                        to={`/operator/shift/${s.id}`}
                        title={`${tone.label} · ${s.driverName ?? 'водитель'} · ${s.startDate}→${s.endDateActual ?? s.endDatePlanned ?? ''}`}
                        className={`absolute top-1.5 bottom-1.5 ${tone.bg} flex items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white shadow-sm transition-opacity hover:opacity-90`}
                        style={{ left: `${geom.left}%`, width: `${geom.width}%` }}
                      >
                        <span className="truncate">{s.driverName ?? `вахта №${s.id}`}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
/** вахта накрывает дату iso (включительно по дням)? */
function covers(s: Shift, iso: string): boolean {
  const start = parseISO(s.startDate);
  const end = parseISO(s.endDateActual ?? s.endDatePlanned ?? s.startDate);
  const d = parseISO(iso);
  if (!start || !end || !d) return false;
  return d >= start && d <= end;
}
/** геометрия полосы вахты в % внутри месяца (left/width), null если вне месяца */
function barGeom(s: Shift, y: number, m: number, daysInMonth: number): { left: number; width: number } | null {
  const start = parseISO(s.startDate);
  const end = parseISO(s.endDateActual ?? s.endDatePlanned ?? s.startDate);
  if (!start || !end) return null;
  const mStart = new Date(y, m, 1);
  const mEnd = new Date(y, m, daysInMonth);
  const effStart = start < mStart ? mStart : start;
  const effEnd = end > mEnd ? mEnd : end;
  if (effEnd < mStart || effStart > mEnd) return null;
  const startIdx = effStart.getDate() - 1;
  const endIdx = effEnd.getDate() - 1;
  const span = Math.max(1, endIdx - startIdx + 1);
  return { left: (startIdx / daysInMonth) * 100, width: (span / daysInMonth) * 100 };
}
