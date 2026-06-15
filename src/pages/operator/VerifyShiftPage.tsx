import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { photosApi, type PhotoCategory, type PhotoItem } from '@/api/endpoints/photos';
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
  const photos = useAsync(() => photosApi.byShift(shiftId), [shiftId]);

  const [lightbox, setLightbox] = useState<PhotoItem | null>(null);

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
              Вахта №{s.id}
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
          <Field label="Контрагент" value={s.counterpartyName ?? '—'} />
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

      {/* Фото */}
      <Section
        title="Фото"
        description={
          photos.data
            ? `Приёмка: ${photos.data.acceptance.length} · Сдача: ${photos.data.return.length} · Рапорты: ${photos.data.reports.length} · Чеки: ${photos.data.receipts.length} · Инциденты: ${photos.data.incidents.length}`
            : undefined
        }
      >
        {photos.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : photos.error ? (
          <Card padded>
            <p className="text-sm text-red-700">
              Не удалось загрузить фото: {describeError(photos.error)}
            </p>
          </Card>
        ) : !photos.data || allPhotosCount(photos.data) === 0 ? (
          <Card padded>
            <EmptyState title="Фото не загружены" description="Водитель ещё не приложил фото на приёмке или сдаче." />
          </Card>
        ) : (
          <div className="space-y-4">
            {(['acceptance', 'return', 'reports', 'receipts', 'incidents'] as PhotoCategory[]).map((cat) => {
              const items = photos.data?.[cat] ?? [];
              if (items.length === 0) return null;
              return (
                <Card key={cat} padded>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                    {categoryLabel(cat)} · {items.length}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {items.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox(p)}
                        className="aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-50 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600"
                        aria-label={`Открыть фото ${p.originalName}`}
                      >
                        <AuthPhoto
                          photoId={p.id}
                          alt={p.originalName}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
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

      {/* Lightbox для фото */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Закрыть ✕
          </button>
          <AuthPhoto
            photoId={lightbox.id}
            alt={lightbox.originalName}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-white/70">
            {lightbox.originalName} · загружено{' '}
            {new Date(lightbox.createdAt).toLocaleString('ru')}
          </div>
        </div>
      )}
    </div>
  );
}

function allPhotosCount(p: { acceptance: unknown[]; return: unknown[]; reports: unknown[]; receipts: unknown[]; incidents: unknown[] }): number {
  return p.acceptance.length + p.return.length + p.reports.length + p.receipts.length + p.incidents.length;
}

function categoryLabel(c: PhotoCategory): string {
  switch (c) {
    case 'acceptance': return 'Приёмка';
    case 'return':     return 'Сдача';
    case 'reports':    return 'Сменные рапорты';
    case 'receipts':   return 'Чеки';
    case 'incidents':  return 'Инциденты';
  }
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

  // ГЛОНАСС-сверка заправок: если по технике вахты за дату чека есть
  // FuelIn-события (glonassLiters), сравниваем с литрами по чеку.
  //   расхождение ≤10% → зелёная карточка;
  //   расхождение >10% (или литры в чеке не указаны) → жёлтая + литры
  //   ГЛОНАСС маленькими цифрами в углу;
  //   данных ГЛОНАСС нет → обычная (белая).
  const g = expense.category === 'fuel' && expense.glonassLiters ? expense.glonassLiters : null;
  const glonassMatch =
    g != null && expense.fuelLiters != null
      ? Math.abs(expense.fuelLiters - g) <= 0.1 * g
      : null;
  const glonassTone =
    g == null
      ? ''
      : glonassMatch
        ? 'border-emerald-300 bg-emerald-50/70'
        : 'border-amber-300 bg-amber-50/70';

  return (
    <Card padded className={`relative ${glonassTone}`}>
      {g != null && glonassMatch !== true && (
        <span className="absolute right-2 top-1 text-[10px] font-medium tabular-nums text-amber-700">
          ГЛОНАСС: {g} л
        </span>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-ink-900">
            {expense.amount} ₽ · {expenseCategoryLabel(expense.category)}
            {expense.fuelLiters != null && (
              <span className="ml-1 text-sm font-normal text-ink-600">
                · {expense.fuelLiters} л
              </span>
            )}
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

/**
 * <img> с авторизацией: GET /api/photos/:id требует Bearer-токен, который
 * тег <img> передать не может (поэтому фото «не отображались»). Грузим blob
 * fetch'ем с токеном; object-URL кэшируется в photosApi на сессию.
 */
function AuthPhoto({
  photoId,
  alt,
  className,
  onClick,
}: {
  photoId: number;
  alt: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    photosApi
      .fetchImageUrl(photoId)
      .then((u) => {
        if (alive) setSrc(u);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [photoId]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-ink-100 text-xs text-ink-500 ${className ?? ''}`}>
        нет фото
      </div>
    );
  }
  if (!src) return <Skeleton className={className} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}
