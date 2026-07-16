import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { advancesApi, type UnassignedAdvance } from '@/api/endpoints/advances';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';

/**
 * Подотчётные — неразнесённые выдачи (счёт 71.01, этап 2).
 * Диспетчер привязывает каждую выдачу к вахте (кнопкой ближайшей вахты либо
 * вводом номера). Неопознанные ФИО (нет в employees) — сверху, ждут привязки
 * к сотруднику (этап 4). Данные обновляются автоимпортом 1С каждое утро.
 */
export function OperatorAdvancesPage() {
  const list = useAsync(() => advancesApi.unassigned(), []);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manualId, setManualId] = useState<Record<number, string>>({});

  const rows = list.data ?? [];
  const totalRub = rows.reduce((s, r) => s + r.amount, 0);
  const noFio = rows.filter((r) => r.employee_id == null);
  const withFio = rows.filter((r) => r.employee_id != null);

  async function assign(advId: number, shiftId: number) {
    setBusy(advId);
    setErr(null);
    try {
      await advancesApi.assign(advId, shiftId);
      await list.refetch();
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/operator" className="text-sm text-brand-700 underline">
        ← К дашборду
      </Link>

      <Section
        title="Подотчёт — неразнесённые выдачи"
        description="Наличные, выданные водителям под отчёт (из 1С, счёт 71.01), которые ещё не привязаны к вахте. Привяжи каждую выдачу к вахте — тогда в расчёте вахты учтётся «выдано» и посчитается остаток (выдано − расходы)."
      >
        <Card padded>
          <div className="text-sm text-ink-600">
            Не привязано: <span className="font-semibold text-ink-900">{rows.length}</span> выдач на{' '}
            <span className="font-semibold text-ink-900">{fmtMoney(totalRub)} ₽</span>
          </div>
        </Card>
      </Section>

      {err && <ErrorState title="Не удалось привязать" message={err} />}

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState title="Не удалось загрузить" message={describeError(list.error)} onRetry={list.refetch} />
      ) : rows.length === 0 ? (
        <Card padded>
          <EmptyState title="Всё разнесено" description="Нет неразнесённых подотчётных выдач — все привязаны к вахтам." />
        </Card>
      ) : (
        <div className="space-y-4">
          {noFio.length > 0 && (
            <Section title="Не опознаны по ФИО" description="ФИО из 1С не совпало с сотрудником КИП — сначала нужно завести/сопоставить сотрудника (этап 4).">
              <Card padded className="space-y-2">
                {noFio.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                    <span className="text-ink-800">{r.fio}</span>
                    <span className="tabular-nums text-ink-600">
                      {r.issue_date} · {fmtMoney(r.amount)} ₽
                    </span>
                  </div>
                ))}
              </Card>
            </Section>
          )}

          {withFio.map((r) => (
            <AdvanceRow
              key={r.id}
              row={r}
              busy={busy === r.id}
              manual={manualId[r.id] ?? ''}
              onManual={(v) => setManualId((m) => ({ ...m, [r.id]: v }))}
              onAssign={(shiftId) => assign(r.id, shiftId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AdvanceRow({
  row,
  busy,
  manual,
  onManual,
  onAssign,
}: {
  row: UnassignedAdvance;
  busy: boolean;
  manual: string;
  onManual: (v: string) => void;
  onAssign: (shiftId: number) => void;
}) {
  return (
    <Card padded className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium text-ink-900">{row.emp_name ?? row.fio}</div>
        <div className="tabular-nums text-ink-700">
          выдано {row.issue_date}: <span className="font-semibold">{fmtMoney(row.amount)} ₽</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-ink-500">Привязать к вахте:</span>
        {row.nearShifts.length === 0 ? (
          <span className="text-sm text-ink-400">у водителя нет вахт — появятся, когда заведут</span>
        ) : (
          row.nearShifts.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => onAssign(s.id)}
              className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-100 disabled:opacity-50"
            >
              №{s.id} · {s.start}→{s.end}
            </button>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-400">или номер вахты:</span>
        <input
          value={manual}
          onChange={(e) => onManual(e.target.value.replace(/\D/g, ''))}
          placeholder="№"
          className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <button
          type="button"
          disabled={busy || !manual}
          onClick={() => onAssign(Number(manual))}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Привязать
        </button>
      </div>
    </Card>
  );
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
}
