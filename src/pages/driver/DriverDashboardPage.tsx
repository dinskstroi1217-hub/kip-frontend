import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { RepairSheet } from '@/components/shift/sheets/RepairSheet';
import { DayEntrySheet } from '@/components/shift/sheets/DayEntrySheet';
import { shiftsApi } from '@/api/endpoints/shifts';
import { db } from '@/offline/db';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { cn } from '@/lib/cn';
import type { Shift } from '@/types/shift';

/**
 * Главный экран водителя — action-first (ТЗ «упрощение экранов»).
 *
 * Состояния:
 *  - активная вахта (принята) → 4 крупных действия: Добавить часы / Сообщить о
 *    поломке / Закрыть вахту / Моя оплата. «Закрыть» заблокирована, пока нет
 *    ни одного дня (бэк d6ab9cd возвращает 400) — с подсказкой.
 *  - вахта ждёт приёмки → «Принять машину».
 *  - вахта на проверке → статус + «Моя оплата», без редактирования.
 *  - нет вахты → «Начать вахту».
 * История (закрытые вахты) вынесена в /driver/history (нижнее меню + ссылка).
 */

const ACTIVE_STATUSES = ['pending_acceptance', 'active', 'issue_idle', 'issue_repair'];

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const sync = useSyncStatus();
  // Перф: ОДИН агрегат /api/shifts/driver-home (вахты + дни активной) вместо
  // my + work-days. Раскладываем как раньше — тело экрана не меняется.
  const home = useAsync(() => shiftsApi.driverHome(), []);
  const data = home.data?.shifts;
  const error = home.error;
  const isLoading = home.isLoading;
  const refetch = home.refetch;

  const shifts = data ?? [];
  const active = shifts.find((s) => ACTIVE_STATUSES.includes(s.status));
  const onReview = shifts.find((s) => s.status === 'pending_verification');
  const closedCount = shifts.filter(
    (s) => s.status === 'pending_verification' || s.status === 'verified',
  ).length;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // id активной принятой вахты (для подсчёта дней под guard «Закрыть»).
  const activeId = active && active.status !== 'pending_acceptance' ? active.id : '';

  // Дни активной вахты: с сервера (из агрегата driverHome) + ещё не отправленные
  // из офлайн-очереди. Нужны, чтобы заблокировать «Закрыть вахту» при нуле (бэк 400).
  const queuedDayCount = useLiveQuery(
    async () => {
      if (!activeId) return 0;
      return db.outbox
        .where('entityId')
        .equals(activeId)
        .filter((i) => i.entityType === 'work_day')
        .count();
    },
    [activeId],
    0,
  );
  const daysCount = (home.data?.activeDaysCount ?? 0) + (queuedDayCount ?? 0);

  const [sheet, setSheet] = useState<'hours' | 'repair' | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="Не удалось загрузить вахты" message={describeError(error)} onRetry={refetch} />
    );
  }

  const accepted = active && active.status !== 'pending_acceptance';

  return (
    <div className="space-y-5">
      {/* Активная принятая вахта → 4 действия */}
      {active && accepted && (
        <>
          <ActiveShiftCard shift={active} />

          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              label="Добавить часы"
              hint="День работы / простоя"
              tone="primary"
              onClick={() => setSheet('hours')}
            />
            <ActionButton
              label="Сообщить о поломке"
              hint="С фото, уйдёт механикам"
              tone="bad"
              onClick={() => setSheet('repair')}
            />
            <ActionButton
              label="Закрыть вахту"
              hint={daysCount === 0 ? 'Сначала добавьте день' : 'Завершить и сдать'}
              tone="neutral"
              disabled={daysCount === 0}
              onClick={() => navigate(`/driver/shift/${active.id}/end`)}
            />
            <ActionButton
              label="Моя оплата"
              hint="Ставка и расчёт"
              tone="info"
              onClick={() => navigate(`/driver/shift/${active.id}`)}
            />
          </div>

          {daysCount === 0 && (
            <p className="text-center text-xs text-ink-500">
              Чтобы закрыть вахту, добавьте хотя бы один день (работа / простой / ремонт).
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate(`/driver/shift/${active.id}`)}
            className="w-full text-center text-sm text-brand-700 underline"
          >
            Открыть вахту целиком →
          </button>

          <DayEntrySheet
            open={sheet === 'hours'}
            onClose={() => setSheet(null)}
            shiftId={active.id}
            defaultDate={today}
            onSuccess={() => void refetch()}
          />
          <RepairSheet
            open={sheet === 'repair'}
            onClose={() => setSheet(null)}
            shiftId={active.id}
            onSuccess={() => void refetch()}
          />
        </>
      )}

      {/* Вахта ждёт приёмки */}
      {active && !accepted && (
        <>
          <ActiveShiftCard shift={active} />
          <Button size="xl" fullWidth onClick={() => navigate(`/driver/shift/${active.id}`)}>
            Принять машину
          </Button>
        </>
      )}

      {/* Нет активной, но есть на проверке */}
      {!active && onReview && (
        <Card padded className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Вахта на проверке</h2>
            <StatusBadge status={onReview.status} />
          </div>
          <p className="text-sm text-ink-600">
            Вахта сдана и ждёт проверки оператором. Итоговый расчёт появится после проверки.
          </p>
          <Button size="lg" fullWidth onClick={() => navigate(`/driver/shift/${onReview.id}`)}>
            Моя оплата
          </Button>
        </Card>
      )}

      {/* Нет вахт вообще */}
      {!active && !onReview && (
        <EmptyState
          icon={
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="8" width="18" height="11" rx="2" />
              <path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
              <path d="M12 12v3" />
            </svg>
          }
          title="Активной вахты нет"
          description="Когда оператор назначит вахту или вы готовы выйти в рейс — начните её здесь."
          action={
            <Button size="xl" onClick={() => navigate('/driver/shift/start')} className="mt-2">
              Начать вахту
            </Button>
          }
        />
      )}

      {/* История — вглубь */}
      {closedCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/driver/history')}
          className="flex w-full items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3 text-left shadow-card transition-colors hover:bg-ink-50"
        >
          <span className="font-medium text-ink-900">Закрытые вахты</span>
          <span className="text-sm text-ink-500">{closedCount}&nbsp;→</span>
        </button>
      )}

      {sync.total > 0 && (
        <Card padded className="border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            <span aria-hidden>↑ </span>
            <strong>{sync.total}</strong> изменений ждут отправки. Они уйдут автоматически, когда
            будет связь.
          </p>
        </Card>
      )}
    </div>
  );
}

function ActiveShiftCard({ shift }: { shift: Shift }) {
  const startDate = shift.startDate ? new Date(shift.startDate) : null;
  const today = new Date();
  const daysElapsed =
    startDate != null
      ? Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : null;
  const daysPlanned =
    startDate != null && shift.endDatePlanned
      ? Math.max(
          1,
          Math.floor(
            (new Date(shift.endDatePlanned).getTime() - startDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : null;

  return (
    <Card padded>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">Текущая вахта</h2>
        <StatusBadge status={shift.status} />
      </div>
      <dl className="space-y-2 text-sm">
        <Row
          label="Машина"
          value={
            shift.equipmentRegNumber
              ? `${shift.equipmentRegNumber}${shift.equipmentName ? ` · ${shift.equipmentName}` : ''}`
              : (shift.equipmentName ?? (shift.equipmentId != null ? String(shift.equipmentId) : '—'))
          }
        />
        <Row
          label="Объект"
          value={shift.siteName ?? (shift.siteId != null ? String(shift.siteId) : '—')}
        />
        <Row
          label="Длительность"
          value={
            daysElapsed != null && daysPlanned != null
              ? `${daysElapsed} / ${daysPlanned} дн.`
              : daysElapsed != null
                ? `${daysElapsed} дн.`
                : '—'
          }
        />
        {startDate && (
          <Row label="Начало" value={format(startDate, 'd MMMM yyyy', { locale: ru })} />
        )}
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{value}</dd>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  hint: string;
  onClick: () => void;
  tone: 'primary' | 'bad' | 'info' | 'neutral';
  disabled?: boolean;
}

function ActionButton({ label, hint, onClick, tone, disabled }: ActionButtonProps) {
  const toneClass: Record<ActionButtonProps['tone'], string> = {
    primary: 'border-brand-300 bg-brand-50 text-brand-900 hover:bg-brand-100',
    bad: 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100',
    info: 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100',
    neutral: 'border-ink-200 bg-white text-ink-900 hover:bg-ink-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[96px] flex-col items-start justify-center rounded-xl border-2 px-4 py-3 text-left shadow-card transition-colors',
        disabled ? 'cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400' : toneClass[tone],
      )}
    >
      <span className="text-base font-semibold">{label}</span>
      <span className="mt-0.5 text-sm opacity-80">{hint}</span>
    </button>
  );
}
