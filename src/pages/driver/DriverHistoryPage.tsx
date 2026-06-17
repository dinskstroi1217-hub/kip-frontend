import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { shiftsApi } from '@/api/endpoints/shifts';
import { payShort } from '@/components/shift/MyPayCard';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift } from '@/types/shift';

/**
 * История водителя — закрытые вахты (сданы/подтверждены) с суммой к выплате.
 * Вынесена «вглубь» из главного экрана (ТЗ «упрощение экранов»), доступна
 * из нижнего меню. Тап по вахте → деталь (ShiftActivePage, read-only + «Моя оплата»).
 */
export function DriverHistoryPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useAsync(() => shiftsApi.my(), []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <ErrorState title="Не удалось загрузить" message={describeError(error)} onRetry={refetch} />;
  }

  const closed = (data ?? [])
    .filter((s) => s.status === 'pending_verification' || s.status === 'verified')
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ink-900">Закрытые вахты</h1>
      {closed.length === 0 ? (
        <Card padded>
          <EmptyState title="Пока пусто" description="Здесь появятся завершённые вахты с расчётом." />
        </Card>
      ) : (
        <div className="space-y-2">
          {closed.map((s) => (
            <ClosedShiftRow key={s.id} shift={s} onClick={() => navigate(`/driver/shift/${s.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClosedShiftRow({ shift, onClick }: { shift: Shift; onClick: () => void }) {
  const pay = payShort(shift);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left shadow-card transition-colors hover:bg-ink-50 active:bg-ink-100"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-ink-900">
          {shift.equipmentRegNumber ?? shift.equipmentName ?? `Вахта #${shift.id}`}
        </div>
        <div className="mt-0.5 text-sm text-ink-500">
          {format(new Date(shift.startDate), 'd MMM yyyy', { locale: ru })}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={shift.status} />
        {pay ? (
          <span className="text-sm font-semibold text-brand-800">{pay}</span>
        ) : (
          <span className="text-xs text-ink-400">расчёт скоро</span>
        )}
      </div>
    </button>
  );
}
