import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { shiftsApi } from '@/api/endpoints/shifts';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import type { Shift, ShiftStatus } from '@/types/shift';

/**
 * Простая операторская панель.
 *
 * Два блока:
 *   - Active shifts        — все статусы кроме verified
 *   - Verification queue   — status === pending_verification
 *
 * MVP: read-only список карточек со статусом, ФИО, машиной, объектом.
 * Действия (детальный просмотр, верификация) — Шаг 3+.
 */

const VERIFICATION_STATUS: ShiftStatus = 'pending_verification';

function splitShifts(shifts: Shift[]) {
  const active = shifts.filter((s) => s.status !== 'verified' && s.status !== 'free');
  const verification = shifts.filter((s) => s.status === VERIFICATION_STATUS);
  return { active, verification };
}

export function OperatorDashboardPage() {
  const { data, error, isLoading, refetch } = useAsync(() => shiftsApi.list(), []);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-28 w-full rounded-xl" />
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

  const { active, verification } = splitShifts(data ?? []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/operator/board"
          className="rounded-lg border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          📅 График вахт
        </Link>
        <Link
          to="/operator/employees"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          👥 Сотрудники
        </Link>
        <Link
          to="/operator/objects"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          🏗 Объекты
        </Link>
        <Link
          to="/operator/counterparties"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          🤝 Контрагенты
        </Link>
        <Link
          to="/operator/payroll"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
        >
          💰 Расчёт по водителю
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Section
          title="Активные вахты"
          description={
            active.length > 0
              ? `Всего: ${active.length}`
              : 'Сейчас никто не в активной вахте'
          }
        >
          {active.length === 0 ? (
            <Card padded>
              <EmptyState
                title="Пусто"
                description="Когда водители выйдут в рейс, карточки появятся здесь."
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((s) => (
                <ShiftCard key={s.id} shift={s} />
              ))}
            </div>
          )}
        </Section>
      </div>

      <div>
        <Section
          title="Очередь проверки"
          description={
            verification.length > 0
              ? `Ожидает верификации: ${verification.length}`
              : 'Очередь пуста'
          }
        >
          {verification.length === 0 ? (
            <Card padded>
              <EmptyState title="Ничего не ждёт" />
            </Card>
          ) : (
            <div className="space-y-3">
              {verification.map((s) => (
                <ShiftCard key={s.id} shift={s} compact />
              ))}
            </div>
          )}
        </Section>
      </div>
      </div>
    </div>
  );
}

function ShiftCard({ shift, compact }: { shift: Shift; compact?: boolean }) {
  return (
    <Link
      to={`/operator/shift/${shift.id}`}
      className="block rounded-xl outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <Card padded>
        <CardHeader>
          <CardTitle>{`Вахта №${shift.id}`}</CardTitle>
          <StatusBadge status={shift.status} size={compact ? 'sm' : 'md'} />
        </CardHeader>
        <dl className="space-y-1.5 text-sm">
          <Row
            label="Водитель"
            value={shift.driverName ?? `#${shift.driverId}`}
          />
          <Row
            label="Машина"
            value={
              shift.equipmentRegNumber
                ? `${shift.equipmentRegNumber}${shift.equipmentName ? ` · ${shift.equipmentName}` : ''}`
                : (shift.equipmentName ?? '—')
            }
          />
          <Row label="Объект" value={shift.siteName ?? '—'} />
          {shift.startDate && <Row label="Начало" value={shift.startDate} />}
        </dl>
      </Card>
    </Link>
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
