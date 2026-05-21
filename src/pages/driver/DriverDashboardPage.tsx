import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { shiftsApi } from '@/api/endpoints/shifts';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Shift } from '@/types/shift';

/**
 * Главный экран водителя.
 *
 * Выводит активную вахту (если есть) или приглашение начать.
 * Главное правило UX: подсказывает следующее действие.
 *
 * Возможные состояния (Driver main state из dev-brief):
 *  - noActiveShift            → CTA "Начать вахту"
 *  - shiftNeedsAcceptance     → CTA "Принять машину"
 *  - shiftActive + дни в норме→ карточка + быстрые действия
 *  - todayNotFilled           → CTA "Заполнить сегодня"  (полный расчёт — в Шаге 2)
 *  - shiftReadyToClose        → CTA "Завершить вахту"
 *
 * В Шаге 1 реализованы первые три; todayNotFilled / shiftReadyToClose
 * полноценно подключатся после интеграции work-days и дат вахт.
 */

type DashboardState =
  | { kind: 'noActiveShift' }
  | { kind: 'shiftNeedsAcceptance'; shift: Shift }
  | { kind: 'shiftActive'; shift: Shift }
  | { kind: 'shiftReadyToClose'; shift: Shift };

function deriveState(shifts: Shift[]): DashboardState {
  const active = shifts.find((s) =>
    ['pending_acceptance', 'active', 'issue_idle', 'issue_repair'].includes(s.status),
  );
  if (!active) return { kind: 'noActiveShift' };
  if (active.status === 'pending_acceptance') {
    return { kind: 'shiftNeedsAcceptance', shift: active };
  }
  // assumption: пока не подключены work-days и дата окончания —
  // не различаем shiftActive vs shiftReadyToClose. Раскроем в Шаге 2.
  if (active.endDatePlanned) {
    const planned = new Date(active.endDatePlanned).getTime();
    if (planned <= Date.now()) return { kind: 'shiftReadyToClose', shift: active };
  }
  return { kind: 'shiftActive', shift: active };
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const sync = useSyncStatus();
  const { data, error, isLoading, refetch } = useAsync(() => shiftsApi.my(), []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Не удалось загрузить вахты"
        message={describeError(error)}
        onRetry={refetch}
      />
    );
  }

  const state = deriveState(data ?? []);

  return (
    <div className="space-y-5">
      {state.kind === 'noActiveShift' && (
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
            <Button
              size="xl"
              onClick={() => navigate('/driver/shift/start')}
              className="mt-2"
            >
              Начать вахту
            </Button>
          }
        />
      )}

      {(state.kind === 'shiftNeedsAcceptance' ||
        state.kind === 'shiftActive' ||
        state.kind === 'shiftReadyToClose') && (
        <>
          <ActiveShiftCard shift={state.shift} />

          <MainCta
            kind={state.kind}
            onStart={() => navigate(`/driver/shift/${state.shift.id}`)}
            onEnd={() => navigate(`/driver/shift/${state.shift.id}/end`)}
          />

          <Section title="Быстрые действия">
            <div className="grid grid-cols-2 gap-3">
              <QuickAction
                label="Часы"
                hint="Внести день"
                onClick={() => navigate(`/driver/shift/${state.shift.id}`)}
              />
              <QuickAction
                label="Простой"
                hint="Зафиксировать"
                onClick={() => navigate(`/driver/shift/${state.shift.id}?event=idle`)}
              />
              <QuickAction
                label="Ремонт"
                hint="Сообщить о поломке"
                onClick={() => navigate(`/driver/shift/${state.shift.id}?event=repair`)}
              />
              <QuickAction
                label="Расход"
                hint="Чек / заправка"
                onClick={() => navigate(`/driver/shift/${state.shift.id}?event=expense`)}
              />
            </div>
          </Section>
        </>
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
        <Row label="Машина" value={String(shift.equipmentId ?? '—')} />
        <Row label="Объект" value={String(shift.siteId ?? '—')} />
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

function MainCta({
  kind,
  onStart,
  onEnd,
}: {
  kind: DashboardState['kind'];
  onStart: () => void;
  onEnd: () => void;
}) {
  if (kind === 'shiftReadyToClose') {
    return (
      <Button size="xl" fullWidth onClick={onEnd}>
        Завершить вахту
      </Button>
    );
  }
  if (kind === 'shiftNeedsAcceptance') {
    return (
      <Button size="xl" fullWidth onClick={onStart}>
        Принять машину
      </Button>
    );
  }
  return (
    <Button size="xl" fullWidth onClick={onStart}>
      Открыть вахту
    </Button>
  );
}

function QuickAction({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[80px] flex-col items-start justify-center rounded-xl border border-ink-200 bg-white px-4 py-3 text-left shadow-card transition-colors hover:bg-ink-50 active:bg-ink-100"
    >
      <span className="text-base font-semibold text-ink-900">{label}</span>
      <span className="text-sm text-ink-500">{hint}</span>
    </button>
  );
}
