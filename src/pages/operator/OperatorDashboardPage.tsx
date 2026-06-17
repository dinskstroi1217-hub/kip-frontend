import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { shiftsApi } from '@/api/endpoints/shifts';
import { workDaysApi } from '@/api/endpoints/workDays';
import { incidentsApi } from '@/api/endpoints/incidents';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift, ShiftStatus } from '@/types/shift';

/**
 * Главная диспетчера (ТЗ упрощения): «где сейчас проблема и что проверить».
 *   - 4 KPI-карточки (кликабельны → фильтруют список ниже);
 *   - по умолчанию вкладка «Проблемы» — только то, что требует действия;
 *   - вкладка «Все» — обычные активные вахты;
 *   - строка: водитель · техника · объект · статус · часы · сумма · причина (красным).
 * Данные: shifts + work_days + incidents (объём пилота мал → тянем все, фильтр на клиенте).
 */

type Period = 'today' | 'yesterday' | 'week' | 'month';
type StatusFilter = 'all' | 'review' | 'nohours' | 'repair' | 'closed';
type Tab = 'problems' | 'all';

interface Problem { key: string; label: string; sev: 'error' | 'warn' | 'action' }
interface Row { shift: Shift; effRate: number | null; hours: number | null; problems: Problem[] }

export function OperatorDashboardPage() {
  const shifts = useAsync(() => shiftsApi.list(), []);
  const workDays = useAsync(() => workDaysApi.list(), []);
  const incidents = useAsync(() => incidentsApi.list(), []);

  const [period, setPeriod] = useState<Period>('month');
  const [objectFilter, setObjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<Tab>('problems');

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const range = periodRange(period, today);

  const rows: Row[] = useMemo(() => {
    const all = shifts.data ?? [];
    const wdByShift = new Map<string, Set<string>>();
    for (const w of workDays.data ?? []) {
      if (!wdByShift.has(w.shiftId)) wdByShift.set(w.shiftId, new Set());
      wdByShift.get(w.shiftId)!.add(w.date);
    }
    const repairShifts = new Set(
      (incidents.data ?? []).filter((i) => i.type === 'repair' && i.status === 'open').map((i) => i.shiftId),
    );

    return all.map((s) => {
      const effRate = s.rateOverride ?? s.hourlyRate ?? null;
      const dates = wdByShift.get(s.id) ?? new Set<string>();
      const isActive = s.status === 'active' || s.status === 'issue_idle' || s.status === 'issue_repair';
      const coversYesterday = s.startDate <= yesterday && (s.endDateActual ?? s.endDatePlanned ?? s.startDate) >= yesterday;
      const problems: Problem[] = [];
      if (s.status === 'pending_verification') problems.push({ key: 'review', label: 'на проверке', sev: 'action' });
      if (isActive && coversYesterday && !dates.has(yesterday)) problems.push({ key: 'nohours', label: 'нет часов за вчера', sev: 'error' });
      if (repairShifts.has(s.id) || s.status === 'issue_repair') problems.push({ key: 'repair', label: 'в ремонте', sev: 'warn' });
      if ((isActive || s.status === 'pending_verification') && !(effRate && effRate > 0)) problems.push({ key: 'norate', label: 'нет ставки', sev: 'error' });
      if ((s.totalPay ?? 0) < 0) problems.push({ key: 'neg', label: 'отрицательная сумма', sev: 'error' });
      if (s.equipmentId == null) problems.push({ key: 'noeq', label: 'нет техники', sev: 'error' });
      if ((s.totalPay ?? 0) > 100000) problems.push({ key: 'big', label: 'крупная выплата', sev: 'warn' });
      if ((s.rateBonus ?? 0) > 0) problems.push({ key: 'bonus', label: 'ручная надбавка', sev: 'warn' });
      return { shift: s, effRate, hours: s.totalWorked ?? null, problems };
    });
  }, [shifts.data, workDays.data, incidents.data, yesterday]);

  const kpi = useMemo(() => {
    const inPeriod = (s: Shift) => s.startDate <= range.to && (s.endDateActual ?? s.endDatePlanned ?? s.startDate) >= range.from;
    return {
      review: rows.filter((r) => r.shift.status === 'pending_verification').length,
      nohours: rows.filter((r) => r.problems.some((p) => p.key === 'nohours')).length,
      repair: rows.filter((r) => r.problems.some((p) => p.key === 'repair')).length,
      payout: rows.filter((r) => inPeriod(r.shift)).reduce((sum, r) => sum + (r.shift.totalPay ?? 0), 0),
    };
  }, [rows, range.from, range.to]);

  const objects = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.shift.siteName) set.add(r.shift.siteName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows;
    if (tab === 'problems') list = list.filter((r) => r.problems.length > 0);
    else list = list.filter((r) => r.shift.status !== 'free');
    if (statusFilter === 'review') list = list.filter((r) => r.shift.status === 'pending_verification');
    else if (statusFilter === 'nohours') list = list.filter((r) => r.problems.some((p) => p.key === 'nohours'));
    else if (statusFilter === 'repair') list = list.filter((r) => r.problems.some((p) => p.key === 'repair'));
    else if (statusFilter === 'closed') list = list.filter((r) => r.shift.status === 'verified');
    if (objectFilter) list = list.filter((r) => r.shift.siteName === objectFilter);
    list = list.filter((r) => r.shift.startDate <= range.to && (r.shift.endDateActual ?? r.shift.endDatePlanned ?? r.shift.startDate) >= range.from);
    const sev = (r: Row) => (r.problems.some((p) => p.sev === 'error') ? 0 : r.problems.some((p) => p.sev === 'warn') ? 1 : r.problems.length ? 2 : 3);
    return list.slice().sort((a, b) => sev(a) - sev(b) || (a.shift.equipmentRegNumber ?? '').localeCompare(b.shift.equipmentRegNumber ?? '', 'ru'));
  }, [rows, tab, statusFilter, objectFilter, range.from, range.to]);

  const onKpi = (f: StatusFilter) => { setStatusFilter(f); setTab(f === 'all' ? 'all' : 'problems'); };

  const loading = shifts.isLoading || workDays.isLoading || incidents.isLoading;
  const error = shifts.error || workDays.error || incidents.error;
  const refetchAll = () => { void shifts.refetch(); void workDays.refetch(); void incidents.refetch(); };

  return (
    <div className="space-y-5">
      {/* Навигация */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/operator/board" className="rounded-lg border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">📅 График вахт</Link>
        <Link to="/operator/payroll" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50">💰 Расчёт по водителю</Link>
        <Link to="/operator/revenue" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50">📊 Финотчёт</Link>
        <Link to="/operator/employees" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50">👥 Сотрудники</Link>
        <Link to="/operator/objects" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50">🏗 Объекты</Link>
        <Link to="/operator/counterparties" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50">🤝 Контрагенты</Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ждут проверки" value={kpi.review} tone={kpi.review > 0 ? 'amber' : 'ink'} active={statusFilter === 'review'} onClick={() => onKpi('review')} />
        <KpiCard label="Без часов за вчера" value={kpi.nohours} tone={kpi.nohours > 0 ? 'red' : 'ink'} active={statusFilter === 'nohours'} onClick={() => onKpi('nohours')} />
        <KpiCard label="В ремонте" value={kpi.repair} tone={kpi.repair > 0 ? 'red' : 'ink'} active={statusFilter === 'repair'} onClick={() => onKpi('repair')} />
        <KpiCard label={`К выплате · ${PERIOD_LABEL[period]}`} value={`${fmtMoney(kpi.payout)} ₽`} tone="emerald" active={false} onClick={() => onKpi('all')} />
      </div>

      {/* Фильтры */}
      <Card padded className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-ink-200">
          <button type="button" onClick={() => setTab('problems')} className={'px-3 py-1.5 text-sm font-medium ' + (tab === 'problems' ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-ink-50')}>Проблемы</button>
          <button type="button" onClick={() => setTab('all')} className={'px-3 py-1.5 text-sm font-medium ' + (tab === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-ink-50')}>Все</button>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm">
          <option value="today">Сегодня</option>
          <option value="yesterday">Вчера</option>
          <option value="week">Неделя</option>
          <option value="month">Месяц</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm">
          <option value="all">Все статусы</option>
          <option value="review">На проверке</option>
          <option value="nohours">Без часов</option>
          <option value="repair">Ремонт</option>
          <option value="closed">Закрытые</option>
        </select>
        <select value={objectFilter} onChange={(e) => setObjectFilter(e.target.value)} className="max-w-[200px] rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm">
          <option value="">Все объекты</option>
          {objects.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Card>

      {/* Список */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : error ? (
        <ErrorState title="Не удалось загрузить" message={describeError(error)} onRetry={refetchAll} />
      ) : visible.length === 0 ? (
        <Card padded>
          <EmptyState
            title={tab === 'problems' ? 'Проблем нет 🎉' : 'Пусто'}
            description={tab === 'problems' ? 'Всё, что требовало внимания, разобрано. Переключись на «Все», чтобы видеть обычные вахты.' : 'Нет вахт по выбранным фильтрам.'}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => <ShiftRow key={r.shift.id} row={r} />)}
        </div>
      )}
    </div>
  );
}

// ── components ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone, active, onClick }: { label: string; value: number | string; tone: 'red' | 'amber' | 'emerald' | 'ink'; active: boolean; onClick: () => void }) {
  const toneCls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-700' : 'text-ink-900';
  return (
    <button type="button" onClick={onClick} className={'rounded-xl border bg-white px-4 py-3 text-left transition-colors hover:bg-ink-50 ' + (active ? 'border-brand-600 ring-1 ring-brand-600' : 'border-ink-200')}>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className={'mt-1 text-2xl font-bold tabular-nums ' + toneCls}>{value}</div>
    </button>
  );
}

function ShiftRow({ row }: { row: Row }) {
  const s = row.shift;
  const hasError = row.problems.some((p) => p.sev === 'error');
  return (
    <Card padded className={hasError ? 'border-red-300 bg-red-50/60' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">
            {s.driverName ?? `Водитель #${s.driverId}`}
            <span className="font-normal text-ink-500"> · {s.equipmentRegNumber || s.equipmentName || 'без техники'}{s.siteName ? ` · ${s.siteName}` : ''}</span>
          </div>
          <div className="mt-0.5 text-sm text-ink-600">
            {simpleStatus(s.status)}
            {row.hours != null && <> · {fmtHours(row.hours)} ч</>}
            {s.totalPay != null && s.totalPay > 0 && <> · {fmtMoney(s.totalPay)} ₽</>}
          </div>
          {row.problems.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {row.problems.map((p) => (
                <span key={p.key} className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (p.sev === 'error' ? 'bg-red-100 text-red-800' : p.sev === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800')}>{p.label}</span>
              ))}
            </div>
          )}
        </div>
        <Link to={`/operator/shift/${s.id}`} className="shrink-0 rounded-lg border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Открыть</Link>
      </div>
    </Card>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const PERIOD_LABEL: Record<Period, string> = { today: 'сегодня', yesterday: 'вчера', week: 'неделя', month: 'месяц' };

function simpleStatus(s: ShiftStatus): string {
  switch (s) {
    case 'pending_verification': return 'на проверке';
    case 'verified': return 'закрыта';
    case 'issue_repair': return 'ремонт';
    case 'issue_idle': return 'простой';
    case 'pending_acceptance': return 'назначена';
    case 'free': return 'свободна';
    default: return 'активна';
  }
}
function fmtMoney(n: number): string { return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)); }
function fmtHours(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function todayISO(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function periodRange(p: Period, today: string): { from: string; to: string } {
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') { const y = addDaysISO(today, -1); return { from: y, to: y }; }
  if (p === 'week') return { from: addDaysISO(today, -6), to: today };
  const [y, m] = today.split('-');
  return { from: `${y}-${m}-01`, to: today };
}
