import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/status/StatusBadge';
import { DayCard } from '@/components/shift/DayCard';
import { MyPayCard } from '@/components/shift/MyPayCard';
import { IdleSheet } from '@/components/shift/sheets/IdleSheet';
import { RepairSheet } from '@/components/shift/sheets/RepairSheet';
import { ExpenseSheet } from '@/components/shift/sheets/ExpenseSheet';
import { EditDaySheet } from '@/components/shift/sheets/EditDaySheet';
import { useLiveQuery } from 'dexie-react-hooks';
import { shiftsApi } from '@/api/endpoints/shifts';
import { workDaysApi } from '@/api/endpoints/workDays';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/offline/db';
import { cn } from '@/lib/cn';
import type { WorkDay, WorkDayType, IdleReason } from '@/types/workDay';
import type { Shift, ShiftStatus } from '@/types/shift';
import type { SyncQueueItem } from '@/types/sync';

/**
 * Активная вахта — основной рабочий экран водителя.
 *
 * Структура:
 *   - Шапка: компактная карточка вахты (статус, машина, объект, длительность)
 *   - Сегодня: форма ввода дня (тип + часы + комментарий) → POST /api/work-days
 *   - Дни вахты: список карточек, сорт по дате DESC
 *   - Быстрые действия: 4 кнопки → BottomSheet'ы (простой/ремонт/заправка/расход)
 *   - CTA «Завершить вахту» — когда planned end сегодня или прошёл
 *
 * Query-параметры (deep-link с DriverDashboard quick actions):
 *   ?event=idle    — сразу открыть IdleSheet
 *   ?event=repair  — RepairSheet
 *   ?event=fuel    — ExpenseSheet с category='fuel'
 *   ?event=expense — ExpenseSheet
 */

type ActiveSheet = 'idle' | 'repair' | 'fuel' | 'expense' | null;

// Ремонт — теперь отдельное поле «Часы ремонта» (repair_hours), не тип дня.
const TYPES: { value: WorkDayType; label: string }[] = [
  { value: 'work', label: 'Работа' },
  { value: 'idle', label: 'Простой' },
];

/**
 * Реконструирует «день» из элемента офлайн-очереди (work_day), чтобы показать
 * его в списке ещё ДО отправки на сервер (иначе офлайн-запись невидима →
 * водитель вводит повторно → дубль). Парсит сохранённое JSON-тело запроса.
 */
function outboxItemToWorkDay(item: SyncQueueItem, fallbackShiftId: string): WorkDay {
  const data =
    item.body && item.body.kind === 'json'
      ? (item.body.data as {
          shift_id?: unknown;
          work_date?: unknown;
          hours_worked?: unknown;
          notes?: unknown;
        })
      : {};
  let meta: { type?: WorkDayType; idleReason?: IdleReason; comment?: string } = {};
  if (typeof data.notes === 'string') {
    try {
      const j = JSON.parse(data.notes);
      if (j && typeof j === 'object') meta = j as typeof meta;
    } catch {
      /* notes не JSON — игнорируем */
    }
  }
  const hours = Number(data.hours_worked);
  return {
    id: `local:${item.id}`,
    shiftId: data.shift_id != null ? String(data.shift_id) : fallbackShiftId,
    // fallback на сегодня: пустая/битая дата уронила бы date-fns format() в DayCard
    date: typeof data.work_date === 'string' && data.work_date
      ? data.work_date
      : new Date().toISOString().slice(0, 10),
    type: meta.type ?? 'work',
    hours: Number.isFinite(hours) ? hours : 0,
    comment: meta.comment,
    idleReason: meta.idleReason,
    status: 'submitted',
  };
}

export function ShiftActivePage() {
  const { id } = useParams<{ id: string }>();
  const shiftId = id ?? '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Открытие шита через ?event=...
  const queryEvent = searchParams.get('event');
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const [editDay, setEditDay] = useState<WorkDay | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  useEffect(() => {
    if (queryEvent === 'idle' || queryEvent === 'repair' || queryEvent === 'fuel' || queryEvent === 'expense') {
      setSheet(queryEvent as ActiveSheet);
      // Чистим параметр чтобы при back/refresh не переоткрывалось
      const next = new URLSearchParams(searchParams);
      next.delete('event');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryEvent]);

  const shift = useAsync(() => shiftsApi.byId(shiftId), [shiftId]);
  const days = useAsync(() => workDaysApi.list({ shiftId }), [shiftId]);

  // Дни, ещё лежащие в офлайн-очереди — показываем сразу, чтобы водитель не
  // ввёл повторно (= дубль). Реактивно из IndexedDB; исчезают после синка.
  const queuedDays = useLiveQuery(
    async (): Promise<WorkDay[]> => {
      const rows = await db.outbox
        .where('entityId')
        .equals(shiftId)
        .filter((i) => i.entityType === 'work_day')
        .toArray();
      return rows.map((r) => outboxItemToWorkDay(r, shiftId));
    },
    [shiftId],
  );

  // Расходы/поломки в офлайн-очереди — показываем, чтобы водитель видел: сохранено,
  // отправится при связи (иначе вводит повторно = дубль чека).
  const queuedExtras = useLiveQuery(
    async () => {
      const rows = await db.outbox
        .where('entityId')
        .equals(shiftId)
        .filter((i) => i.entityType === 'expense' || i.entityType === 'incident')
        .toArray();
      return rows.map((r) => ({
        id: r.id,
        label: r.entityType === 'incident' ? 'Поломка / ремонт' : 'Расход',
      }));
    },
    [shiftId],
  );

  // Когда очередь УМЕНЬШИЛАСЬ (что-то засинкалось — по любому триггеру: online,
  // таймер, возврат из фона) — подтягиваем серверные дни, чтобы карточка не
  // «исчезла» из очереди до прихода серверной версии (иначе снова повторный ввод).
  const prevQueuedLen = useRef(0);
  useEffect(() => {
    const len = queuedDays?.length ?? 0;
    if (len < prevQueuedLen.current) void days.refetch();
    prevQueuedLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedDays]);

  // Очередь (pending) сверху, затем серверные дни.
  const mergedDays = useMemo<WorkDay[]>(
    () => [...(queuedDays ?? []), ...(days.data ?? [])],
    [queuedDays, days.data],
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // ВАЖНО: учитываем и очередь — иначе офлайн-день не считается «внесён сегодня»
  // и форма провоцирует повторный ввод.
  const hasTodayEntry = useMemo(
    () => mergedDays.some((d) => d.date === today),
    [mergedDays, today],
  );

  // Онлайн-путь: перечитать после сохранения (офлайн-карточка и так видна из очереди).
  const appendDay = useCallback(() => {
    days.refetch().catch(() => void 0);
  }, [days]);

  if (shift.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }
  if (shift.error || !shift.data) {
    return (
      <ErrorState
        title="Вахта не найдена"
        message={shift.error ? describeError(shift.error) : 'Возможно, она была удалена'}
        onRetry={() => shift.refetch()}
      />
    );
  }

  // Закрыть вахту можно в любой момент активной работы — в т.ч. ДОСРОЧНО (машину
  // забрали / объект закончился). Раньше кнопка появлялась только по плановой дате,
  // и досрочно сдать вахту через UI было нельзя.
  const canClose = (['active', 'issue_idle', 'issue_repair'] as ShiftStatus[]).includes(
    shift.data.status,
  );
  const closeEarly =
    !!shift.data.endDatePlanned && new Date(shift.data.endDatePlanned).getTime() > Date.now();
  // Закрытая вахта (сдана/подтверждена) — экран становится read-only: показываем
  // расчёт оплаты и историю дней, но прячем форму ввода и быстрые действия.
  const isClosed = (['pending_verification', 'verified'] as ShiftStatus[]).includes(
    shift.data.status,
  );
  // Вахта создана, но не активирована: цепочка create→activate оборвалась (часто
  // из-за моргнувшей связи на мобильном). Бэк не пускает дни (400 «Вахта не
  // активна»). Даём довести одной кнопкой, а не застрять / пересоздавать (дубль).
  const isPending = shift.data.status === 'pending_acceptance';
  // Вахта сдана на проверку: возвращённый (rejected) день ещё можно исправить —
  // бэк это разрешает (H2). Отдельная булева, т.к. в .map ниже TS теряет
  // сужение shift.data по null.
  const onReview = shift.data.status === 'pending_verification';

  async function activateShift() {
    setActivating(true);
    setActivateError(null);
    try {
      await shiftsApi.activate(shiftId);
      await shift.refetch();
    } catch (e) {
      setActivateError(describeError(e));
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/driver" className="text-sm text-brand-700 underline">
        ← На главный
      </Link>

      <ShiftHeader shift={shift.data} />

      <MyPayCard shift={shift.data} />

      {isClosed && (
        <Card padded className="border border-ink-200 bg-ink-50">
          <p className="text-sm text-ink-600">
            Вахта закрыта и передана оператору. Ниже — итог по оплате и история дней.
          </p>
        </Card>
      )}

      {isPending && (
        <Card padded className="space-y-3 border border-amber-200 bg-amber-50">
          <div>
            <p className="font-semibold text-amber-900">Вахта ещё не активна</p>
            <p className="mt-0.5 text-sm text-amber-800">
              Создание вахты не завершилось (возможно, оборвалась связь). Нажмите
              «Активировать» — после этого можно вносить дни, расходы и закрывать вахту.
            </p>
          </div>
          {activateError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {activateError}
            </div>
          )}
          <Button
            size="xl"
            fullWidth
            loading={activating}
            disabled={activating}
            onClick={() => void activateShift()}
          >
            Активировать вахту
          </Button>
        </Card>
      )}

      {!isClosed && !isPending && (
        <>
          {/* Сегодня */}
          <Section title="Сегодня" description={format(new Date(today), 'EEEE, d MMMM', { locale: ru })}>
            {hasTodayEntry ? (
              <Card padded className="border border-emerald-200 bg-emerald-50/60">
                <p className="text-sm text-emerald-900">
                  ✓ День уже внесён. Дополнительные события — через быстрые действия ниже.
                </p>
              </Card>
            ) : (
              <TodayForm shiftId={shiftId} today={today} onSaved={() => void days.refetch()} />
            )}
          </Section>

          {/* Быстрые действия */}
          <Section title="Быстрые действия">
            <div className="grid grid-cols-2 gap-3">
              <QuickButton
                label="Простой"
                tone="warn"
                onClick={() => setSheet('idle')}
                description="С указанием причины"
              />
              <QuickButton
                label="Ремонт"
                tone="bad"
                onClick={() => setSheet('repair')}
                description="С фото поломки"
              />
              <QuickButton
                label="Заправка"
                tone="info"
                onClick={() => setSheet('fuel')}
                description="Чек + литры"
              />
              <QuickButton
                label="Расход"
                tone="neutral"
                onClick={() => setSheet('expense')}
                description="Подотчёт / чек"
              />
            </div>
          </Section>
        </>
      )}

      {/* Дни вахты */}
      <Section title="Дни вахты" description={mergedDays.length ? `Всего: ${mergedDays.length}` : undefined}>
        {days.isLoading && mergedDays.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : days.error && mergedDays.length === 0 ? (
          <ErrorState message={describeError(days.error)} onRetry={days.refetch} />
        ) : mergedDays.length === 0 ? (
          <Card padded>
            <EmptyState title="Дней пока нет" description="Внесите сегодня через форму выше." />
          </Card>
        ) : (
          <div className="space-y-2">
            {[...mergedDays]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((d) => {
                const queued = d.id.startsWith('local:');
                // Править можно: (вахта active И день не approved) ИЛИ (вахта на
                // проверке И день ВОЗВРАЩЁН оператором — H2: исправить reject после
                // закрытия). approved/verified — залочено. Только серверные дни
                // (update это онлайн-PATCH, без офлайн-очереди).
                const editable =
                  !queued &&
                  ((canClose && d.status !== 'approved') ||
                    (onReview && d.status === 'rejected'));
                return (
                  <DayCard
                    key={d.id}
                    day={d}
                    pending={queued}
                    onEdit={editable ? () => setEditDay(d) : undefined}
                  />
                );
              })}
          </div>
        )}
      </Section>

      {/* Офлайн-очередь расходов/поломок — феедбек, чтобы не вводили повторно */}
      {queuedExtras && queuedExtras.length > 0 && (
        <Section title="Ждут отправки">
          <Card padded className="border border-amber-200 bg-amber-50/60">
            <p className="mb-2 text-sm text-amber-900">
              🕓 Сохранено офлайн, отправится при связи — повторно вводить не нужно:
            </p>
            <ul className="space-y-1 text-sm text-amber-900">
              {queuedExtras.map((q) => (
                <li key={q.id}>• {q.label} · ждёт отправки</li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {/* CTA завершить — доступно для активной вахты (досрочно — с подтверждением).
          Бэк (d6ab9cd) не даёт закрыть вахту без единого дня → блокируем кнопку. */}
      {canClose && (
        <div className="space-y-2">
          <Button
            size="xl"
            fullWidth
            disabled={mergedDays.length === 0}
            onClick={() => {
              if (
                closeEarly &&
                !window.confirm('Завершить вахту досрочно? Плановая дата окончания ещё не наступила.')
              )
                return;
              navigate(`/driver/shift/${shiftId}/end`);
            }}
          >
            Завершить вахту{closeEarly ? ' досрочно' : ''}
          </Button>
          {mergedDays.length === 0 && (
            <p className="text-center text-xs text-ink-500">
              Сначала добавьте хотя бы один день — иначе вахту нельзя закрыть.
            </p>
          )}
        </div>
      )}

      {/* Шиты */}
      <IdleSheet
        open={sheet === 'idle'}
        onClose={() => setSheet(null)}
        shiftId={shiftId}
        onSuccess={appendDay}
      />
      <RepairSheet
        open={sheet === 'repair'}
        onClose={() => setSheet(null)}
        shiftId={shiftId}
        onSuccess={() => {
          // После создания incident'а статус вахты мог измениться — перечитаем
          void shift.refetch();
        }}
      />
      <ExpenseSheet
        open={sheet === 'fuel'}
        onClose={() => setSheet(null)}
        shiftId={shiftId}
        initialCategory="fuel"
        titleOverride="Заправка"
        onSuccess={() => void 0}
      />
      <ExpenseSheet
        open={sheet === 'expense'}
        onClose={() => setSheet(null)}
        shiftId={shiftId}
        onSuccess={() => void 0}
      />

      <EditDaySheet
        day={editDay}
        onClose={() => setEditDay(null)}
        onSaved={() => void days.refetch()}
      />
    </div>
  );
}

function ShiftHeader({ shift }: { shift: Shift }) {
  const start = shift.startDate ? new Date(shift.startDate) : null;
  const elapsed =
    start != null
      ? Math.max(
          1,
          Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        )
      : null;
  const planned =
    start != null && shift.endDatePlanned
      ? Math.max(
          1,
          Math.floor(
            (new Date(shift.endDatePlanned).getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : null;

  return (
    <Card padded>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink-900">Вахта #{shift.id}</h1>
          {start && (
            <p className="text-sm text-ink-500">
              С {format(start, 'd MMM', { locale: ru })}
              {elapsed != null && planned != null && ` · день ${elapsed} из ${planned}`}
            </p>
          )}
        </div>
        <StatusBadge status={shift.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <Field
          label="Машина"
          value={
            shift.equipmentRegNumber
              ? `${shift.equipmentRegNumber}${shift.equipmentName ? ` · ${shift.equipmentName}` : ''}`
              : (shift.equipmentName ?? (shift.equipmentId != null ? String(shift.equipmentId) : '—'))
          }
        />
        <Field
          label="Объект"
          value={shift.siteName ?? (shift.siteId != null ? String(shift.siteId) : '—')}
        />
        {shift.odometerStart != null && (
          <Field label="Одометр старт" value={`${shift.odometerStart} км`} />
        )}
        {shift.fuelLevelStart != null && (
          <Field label="Топливо старт" value={`${shift.fuelLevelStart} л`} />
        )}
        {shift.motohoursStart != null && (
          <Field label="Моточасы старт" value={`${shift.motohoursStart} м/ч`} />
        )}
      </dl>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{value}</dd>
    </>
  );
}

interface TodayFormProps {
  shiftId: string;
  today: string;
  onSaved: () => void;
}

function TodayForm({ shiftId, today, onSaved }: TodayFormProps) {
  const [type, setType] = useState<WorkDayType>('work');
  const [hours, setHours] = useState('');
  const [repair, setRepair] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursNum = hours.trim() === '' ? 0 : Number(hours);
  const repairNum = repair.trim() === '' ? 0 : Number(repair);
  const hoursOk = Number.isFinite(hoursNum) && hoursNum >= 0 && hoursNum <= 24;
  const repairOk = Number.isFinite(repairNum) && repairNum >= 0 && repairNum <= 24;
  const valid = hoursOk && repairOk && (hoursNum > 0 || repairNum > 0);

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await workDaysApi.create({
        shiftId,
        date: today,
        type,
        hours: hoursNum,
        repairHours: repairNum,
        comment: comment.trim() || undefined,
      });
      setHours('');
      setRepair('');
      setComment('');
      onSaved();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padded>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Тип дня</p>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  'min-h-tap rounded-lg border-2 px-3 py-2 text-base font-medium transition-colors',
                  type === t.value
                    ? typeToneSelected(t.value)
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label={type === 'idle' ? 'Часы простоя' : 'Рабочие часы'}
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0–24"
          error={hours.length > 0 && !hoursOk ? 'От 0 до 24' : undefined}
        />

        <Input
          label="Часы ремонта (если был)"
          value={repair}
          onChange={(e) => setRepair(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0–24"
          hint="Считаются отдельно — по ставке ремонта, не как рабочие"
          error={repair.length > 0 && !repairOk ? 'От 0 до 24' : undefined}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Комментарий</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={
              repairNum > 0 ? 'Что ремонтировалось' : type === 'idle' ? 'Причина простоя' : 'Необязательно'
            }
            className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <Button fullWidth size="xl" loading={saving} disabled={!valid} onClick={handleSave}>
          Сохранить день
        </Button>
      </div>
    </Card>
  );
}

function typeToneSelected(t: WorkDayType): string {
  switch (t) {
    case 'work':
      return 'border-emerald-600 bg-emerald-50 text-emerald-900';
    case 'idle':
      return 'border-amber-600 bg-amber-50 text-amber-900';
    case 'repair':
      return 'border-red-600 bg-red-50 text-red-900';
    case 'reloc':
      return 'border-sky-600 bg-sky-50 text-sky-900';
  }
}

interface QuickButtonProps {
  label: string;
  description: string;
  onClick: () => void;
  tone: 'warn' | 'bad' | 'info' | 'neutral';
}

function QuickButton({ label, description, onClick, tone }: QuickButtonProps) {
  const toneClass: Record<QuickButtonProps['tone'], string> = {
    warn: 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900',
    bad: 'border-red-300 bg-red-50 hover:bg-red-100 text-red-900',
    info: 'border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900',
    neutral: 'border-ink-200 bg-white hover:bg-ink-50 text-ink-900',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[80px] flex-col items-start justify-center rounded-xl border-2 px-4 py-3 text-left shadow-card transition-colors',
        toneClass[tone],
      )}
    >
      <span className="text-base font-semibold">{label}</span>
      <span className="text-sm opacity-80">{description}</span>
    </button>
  );
}
