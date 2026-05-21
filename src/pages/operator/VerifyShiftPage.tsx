import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { acceptanceApi } from '@/api/endpoints/acceptance';
import { expensesApi } from '@/api/endpoints/expenses';
import { incidentsApi } from '@/api/endpoints/incidents';
import { shiftsApi } from '@/api/endpoints/shifts';
import { workDaysApi } from '@/api/endpoints/workDays';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { WorkDay } from '@/types/workDay';
import type { Expense } from '@/types/expense';

/**
 * Экран верификации одной вахты (только для оператора).
 *
 * Что показываем:
 *   - Шапка: водитель/машина/объект/юрлицо + текущий статус
 *   - Метрики «приёмка vs сдача» с дельтами (одометр, топливо, моточасы)
 *   - Дни вахты — карточки с inline approve/reject
 *   - Расходы — то же
 *   - Инциденты (только список)
 *   - Кнопка «Принять и закрыть вахту» (переводит status → verified)
 *   - Кнопка «Вернуть водителю» (status → active, чтобы пересдать)
 *
 * MVP-упрощения:
 *   - Фото показываются только как количество (Drive-ссылок пока нет).
 *   - Подписи — boolean флаг (ПЭП через сессию).
 *   - reject требует комментарий — простой prompt() пока.
 */
export function VerifyShiftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const shiftId = id ?? '';

  const shift = useAsync(() => shiftsApi.byId(shiftId), [shiftId]);
  const acceptance = useAsync(() => acceptanceApi.byShiftId(shiftId), [shiftId]);
  const returnAct = useAsync(() => acceptanceApi.returnByShiftId(shiftId), [shiftId]);
  const days = useAsync(() => workDaysApi.list({ shiftId }), [shiftId]);
  const expenses = useAsync(() => expensesApi.list({ shiftId }), [shiftId]);
  const incidents = useAsync(() => incidentsApi.list({ shiftId }), [shiftId]);

  const [finalizing, setFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  const onApproveDay = useCallback(
    async (d: WorkDay) => {
      try {
        await workDaysApi.approve(d.id);
        void days.refetch();
      } catch (e) {
        alert(describeError(e));
      }
    },
    [days],
  );

  const onRejectDay = useCallback(
    async (d: WorkDay) => {
      const comment = prompt(`Причина возврата на правку — день ${d.date}:`);
      if (!comment) return;
      try {
        await workDaysApi.reject(d.id, { comment });
        void days.refetch();
      } catch (e) {
        alert(describeError(e));
      }
    },
    [days],
  );

  const onApproveExpense = useCallback(
    async (e: Expense) => {
      try {
        await expensesApi.approve(e.id);
        void expenses.refetch();
      } catch (err) {
        alert(describeError(err));
      }
    },
    [expenses],
  );

  const onRejectExpense = useCallback(
    async (e: Expense) => {
      const comment = prompt(`Причина отклонения расхода ${e.amount}₽:`);
      if (!comment) return;
      try {
        await expensesApi.reject(e.id, { comment });
        void expenses.refetch();
      } catch (err) {
        alert(describeError(err));
      }
    },
    [expenses],
  );

  const onFinalize = useCallback(async () => {
    setFinalError(null);
    setFinalizing(true);
    try {
      // Бэк имеет PATCH /api/shifts/:id (operator-only). Ставим
      // status='verified' (TEXT-колонка, без enum-constraint).
      await shiftsApi.update(shiftId, { status: 'verified' });
      navigate('/operator', { replace: true });
    } catch (e) {
      setFinalError(describeError(e));
    } finally {
      setFinalizing(false);
    }
  }, [shiftId, navigate]);

  const onReturnToDriver = useCallback(async () => {
    if (!confirm('Вернуть вахту водителю на пересдачу?')) return;
    setFinalError(null);
    setFinalizing(true);
    try {
      await shiftsApi.update(shiftId, { status: 'active' });
      navigate('/operator', { replace: true });
    } catch (e) {
      setFinalError(describeError(e));
    } finally {
      setFinalizing(false);
    }
  }, [shiftId, navigate]);

  // Метрики приёмки vs сдачи
  const metrics = useMemo(() => {
    const a = acceptance.data;
    const r = returnAct.data;
    return {
      odometerStart: a?.checklist.odometerStart ?? null,
      odometerEnd: r?.odometerEnd ?? null,
      odometerDelta:
        a?.checklist.odometerStart != null && r?.odometerEnd != null
          ? r.odometerEnd - a.checklist.odometerStart
          : null,
      fuelStart: a?.checklist.fuelStartLiters ?? null,
      fuelEnd: r?.fuelEndLiters ?? null,
      fuelDelta:
        a?.checklist.fuelStartLiters != null && r?.fuelEndLiters != null
          ? r.fuelEndLiters - a.checklist.fuelStartLiters
          : null,
      photosAcceptance: a?.photoIds.length ?? 0,
      photosReturn: r?.photoIds.length ?? 0,
      reportPhotos: r?.reportPhotoIds.length ?? 0,
    };
  }, [acceptance.data, returnAct.data]);

  if (shift.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (shift.error || !shift.data) {
    return (
      <ErrorState
        title="Не удалось загрузить вахту"
        message={describeError(shift.error ?? new Error('Не найдена'))}
        onRetry={() => void shift.refetch()}
      />
    );
  }

  const s = shift.data;
  const canFinalize = s.status === 'pending_verification';

  return (
    <div className="space-y-6">
      <Link to="/operator" className="text-sm text-brand-700 underline">
        ← В очередь
      </Link>

      {/* Шапка */}
      <Card padded>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink-900">
              вахта №{s.id}
            </h1>
            <p className="mt-0.5 text-sm text-ink-600">
              {s.driverName ?? `Водитель #${s.driverId}`}
              {s.driverPhone && ` · ${s.driverPhone}`}
            </p>
          </div>
          <StatusBadge status={s.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Field
            label="Машина"
            value={
              s.equipmentRegNumber
                ? `${s.equipmentRegNumber}${s.equipmentName ? ` · ${s.equipmentName}` : ''}`
                : (s.equipmentName ?? '—')
            }
          />
          <Field label="Объект" value={s.siteName ?? '—'} />
          <Field label="Юрлицо" value={s.legalEntityName ?? '—'} />
          <Field
            label="План"
            value={`${s.startDate} → ${s.endDatePlanned ?? '—'}`}
          />
        </dl>
      </Card>

      {/* Метрики приёмка vs сдача */}
      <Section title="Показания приёмки и сдачи">
        <Card padded>
          {acceptance.isLoading || returnAct.isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricBlock
                label="Одометр (км)"
                start={metrics.odometerStart}
                end={metrics.odometerEnd}
                delta={metrics.odometerDelta}
                deltaLabel={(d) => `+${d} км`}
              />
              <MetricBlock
                label="Топливо (л)"
                start={metrics.fuelStart}
                end={metrics.fuelEnd}
                delta={metrics.fuelDelta}
                deltaLabel={(d) =>
                  d >= 0 ? `+${d} л (заправлял)` : `${d} л (израсходовано)`
                }
              />
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-500">
                  Фото
                </div>
                <div className="mt-1 text-base text-ink-900">
                  Приёмка: <b>{metrics.photosAcceptance}</b> · Сдача:{' '}
                  <b>{metrics.photosReturn}</b>
                  {metrics.reportPhotos > 0 && (
                    <> · Рапорты: <b>{metrics.reportPhotos}</b></>
                  )}
                </div>
              </div>
            </div>
          )}
          {!acceptance.data && !acceptance.isLoading && (
            <p className="mt-3 text-sm text-amber-700">
              Акт приёмки не найден на бэке.
            </p>
          )}
          {!returnAct.data && !returnAct.isLoading && (
            <p className="mt-1 text-sm text-amber-700">
              Акт сдачи не найден — вахта ещё не закрыта водителем.
            </p>
          )}
        </Card>
      </Section>

      {/* Дни */}
      <Section
        title="Дни вахты"
        description={days.data ? `Всего: ${days.data.length}` : undefined}
      >
        {days.isLoading ? (
          <Skeleton className="h-20" />
        ) : !days.data || days.data.length === 0 ? (
          <Card padded>
            <EmptyState title="Нет дней" description="Водитель не вносил рабочие дни." />
          </Card>
        ) : (
          <div className="space-y-2">
            {days.data
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((d) => (
                <DayRow
                  key={d.id}
                  day={d}
                  onApprove={() => void onApproveDay(d)}
                  onReject={() => void onRejectDay(d)}
                />
              ))}
          </div>
        )}
      </Section>

      {/* Расходы */}
      <Section
        title="Расходы"
        description={expenses.data ? `Всего: ${expenses.data.length}` : undefined}
      >
        {expenses.isLoading ? (
          <Skeleton className="h-20" />
        ) : !expenses.data || expenses.data.length === 0 ? (
          <Card padded>
            <EmptyState title="Расходов нет" />
          </Card>
        ) : (
          <div className="space-y-2">
            {expenses.data.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                onApprove={() => void onApproveExpense(e)}
                onReject={() => void onRejectExpense(e)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Инциденты */}
      <Section
        title="Инциденты"
        description={
          incidents.data ? `Всего: ${incidents.data.length}` : undefined
        }
      >
        {incidents.isLoading ? (
          <Skeleton className="h-20" />
        ) : !incidents.data || incidents.data.length === 0 ? (
          <Card padded>
            <EmptyState title="Инцидентов не было" />
          </Card>
        ) : (
          <div className="space-y-2">
            {incidents.data.map((i) => (
              <Card key={i.id} padded>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <div className="font-semibold text-ink-900">
                      {incidentTypeLabel(i.type)}
                    </div>
                    <div className="mt-0.5 text-ink-700">{i.description}</div>
                  </div>
                  <span
                    className={
                      i.status === 'resolved'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    {i.status === 'resolved' ? 'Решено' : 'Открыто'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Финальные действия */}
      {canFinalize && (
        <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-3 border-t border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur">
          <Button
            variant="secondary"
            size="xl"
            onClick={() => void onReturnToDriver()}
            disabled={finalizing}
          >
            Вернуть водителю
          </Button>
          <Button
            size="xl"
            onClick={() => void onFinalize()}
            disabled={finalizing}
            loading={finalizing}
          >
            Принять и закрыть
          </Button>
        </div>
      )}
      {finalError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {finalError}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function MetricBlock({
  label,
  start,
  end,
  delta,
  deltaLabel,
}: {
  label: string;
  start: number | null;
  end: number | null;
  delta: number | null;
  deltaLabel: (d: number) => string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-base text-ink-900">
        {start ?? '—'} → {end ?? '—'}
      </div>
      {delta != null && (
        <div className="mt-0.5 text-sm text-brand-700">{deltaLabel(delta)}</div>
      )}
    </div>
  );
}

function DayRow({
  day,
  onApprove,
  onReject,
}: {
  day: WorkDay;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = day.status === 'submitted' || day.status === 'draft';
  return (
    <Card padded>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-ink-900">{day.date}</div>
          <div className="text-sm text-ink-600">
            {workDayTypeLabel(day.type)} · {day.hours} ч
            {day.comment && ` · ${day.comment}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DayStatus status={day.status} />
          {pending && (
            <>
              <Button variant="secondary" size="md" onClick={onReject}>
                Вернуть
              </Button>
              <Button size="md" onClick={onApprove}>
                Принять
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function ExpenseRow({
  expense,
  onApprove,
  onReject,
}: {
  expense: Expense;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = expense.status === 'submitted' || expense.status === 'draft';
  return (
    <Card padded>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-ink-900">
            {expense.amount} ₽ · {expenseCategoryLabel(expense.category)}
          </div>
          <div className="text-sm text-ink-600">
            {expense.date}
            {expense.comment && ` · ${expense.comment}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExpenseStatusBadge status={expense.status} />
          {pending && (
            <>
              <Button variant="secondary" size="md" onClick={onReject}>
                Отклонить
              </Button>
              <Button size="md" onClick={onApprove}>
                Принять
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function DayStatus({ status }: { status: WorkDay['status'] }) {
  const label =
    status === 'approved'
      ? 'Принят'
      : status === 'rejected'
        ? 'Возвращён'
        : status === 'submitted'
          ? 'На проверке'
          : 'Черновик';
  const tone =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'rejected'
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function ExpenseStatusBadge({ status }: { status: Expense['status'] }) {
  const label =
    status === 'approved'
      ? 'Принят'
      : status === 'rejected'
        ? 'Отклонён'
        : status === 'submitted'
          ? 'На проверке'
          : 'Черновик';
  const tone =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'rejected'
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function workDayTypeLabel(t: WorkDay['type']): string {
  return t === 'work'
    ? 'Работа'
    : t === 'idle'
      ? 'Простой'
      : t === 'repair'
        ? 'Ремонт'
        : 'Перебазирование';
}

function expenseCategoryLabel(c: Expense['category']): string {
  return c === 'fuel'
    ? 'Топливо'
    : c === 'lodging'
      ? 'Проживание'
      : c === 'meals'
        ? 'Питание'
        : c === 'per_diem'
          ? 'Суточные'
          : c === 'parts'
            ? 'Запчасти'
            : 'Прочее';
}

function incidentTypeLabel(t: 'idle' | 'repair' | 'damage' | 'other'): string {
  return t === 'repair'
    ? 'Ремонт'
    : t === 'damage'
      ? 'Повреждение'
      : t === 'idle'
        ? 'Простой'
        : 'Прочее';
}
