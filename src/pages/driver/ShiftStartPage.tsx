import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import { PhotoUploader, type UploadedPhoto } from '@/components/photo/PhotoUploader';
import { ActConfirmation } from '@/components/signature/ActConfirmation';
import { useAuthStore, selectUser } from '@/features/auth/store';
import { equipmentApi } from '@/api/endpoints/equipment';
import { sitesApi, legalEntitiesApi } from '@/api/endpoints/sites';
import { shiftsApi } from '@/api/endpoints/shifts';
import { apiClient } from '@/api/client';
import { ApiError, describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/cn';
import { geoSoft } from '@/lib/geo';
import type { Equipment } from '@/types/equipment';
import { EQUIPMENT_TYPE_LABEL } from '@/types/equipment';
import type { Site, LegalEntity } from '@/types/site';
import type { GpsTag } from '@/types/acceptance';

/**
 * Начало вахты — wizard 4 шага.
 *
 * Шаг 1: данные (объект / техника / юрлицо / длительность)
 * Шаг 2: чек-лист приёмки (масло / топливо / одометр / повреждения / шины)
 * Шаг 3: фото приёмки (3–10, с подсказками ракурсов)
 * Шаг 4: подпись водителя + GPS soft-попытка
 *
 * Submit-цепочка (порядок важен — бэк принимает акт только для active-вахты):
 *   POST /api/shifts                  → создаём вахту (planned)
 *   POST /api/shifts/:id/activate     → переводим в active
 *   POST /api/acceptance (multipart)  → акт приёмки + фото, плоские snake_case
 *                                       поля; driver_signed бэк ставит сам
 *
 * Все шаги имеют локальный validate → wizard блокирует «Далее» если шаг невалиден.
 * GPS пытаемся фоном на шаге 4 — не блокируем сценарий если не получили.
 */

const DURATION_OPTIONS = [10, 15, 20, 30] as const;
type Duration = (typeof DURATION_OPTIONS)[number];

interface Checklist {
  oilLevel: 'ok' | 'issue' | null;
  fuelStart: string;
  odometerStart: string;
  motohoursStart: string;
  hasDamage: 'yes' | 'no' | null;
  damageDescription: string;
  tires: 'ok' | 'attention' | null;
}

const emptyChecklist: Checklist = {
  oilLevel: null,
  fuelStart: '',
  odometerStart: '',
  motohoursStart: '',
  hasDamage: null,
  damageDescription: '',
  tires: null,
};

export function ShiftStartPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1
  const [siteId, setSiteId] = useState<string | number | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | number | null>(null);
  const [legalEntityId, setLegalEntityId] = useState<string | number | null>(null);
  const [duration, setDuration] = useState<Duration>(15);

  // Step 2
  const [checklist, setChecklist] = useState<Checklist>(emptyChecklist);

  // Step 3
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  // Step 4
  const user = useAuthStore(selectUser);
  const [confirmed, setConfirmed] = useState(false);
  const [gps, setGps] = useState<GpsTag | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'attempting' | 'ok' | 'fail'>('idle');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sites = useAsync(() => sitesApi.list(), []);
  const legalEntities = useAsync(() => legalEntitiesApi.list(), []);
  const equipment = useAsync(() => equipmentApi.list(), []);

  // GPS-попытка при входе на шаг 4
  useEffect(() => {
    if (step !== 3 || gpsState !== 'idle') return;
    setGpsState('attempting');
    void geoSoft({ timeoutMs: 5000 }).then((tag) => {
      if (tag) {
        setGps(tag);
        setGpsState('ok');
      } else {
        setGpsState('fail');
      }
    });
  }, [step, gpsState]);

  const step1Valid = siteId != null && equipmentId != null && legalEntityId != null;
  const step2Valid = useMemo(() => {
    const c = checklist;
    if (!c.oilLevel || !c.hasDamage || !c.tires) return false;
    if (!isPositiveInt(c.fuelStart) || !isPositiveInt(c.odometerStart)) return false;
    if (c.hasDamage === 'yes' && c.damageDescription.trim().length < 3) return false;
    return true;
  }, [checklist]);
  const step3Valid = photos.length >= 3;
  const step4Valid = confirmed;

  async function handleSubmit() {
    setSubmitError(null);
    // Старт смены — строгая цепочка create→activate→acceptance, нужен серверный
    // id создаваемой вахты. Офлайн-очередь это не покрывает (id появится только
    // после отправки). Поэтому при заведомо отсутствующей связи НЕ начинаем
    // цепочку (иначе обрыв после create оставит «осиротевшую» вахту), а просим
    // дождаться сети — заполненные данные остаются в форме.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSubmitError(
        'Нет связи. Для начала смены нужен интернет — заполненные данные сохранены, попробуйте, когда появится сеть.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate = new Date(today.getTime() + duration * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      // 1. Создаём вахту
      const shift = await shiftsApi.create({
        equipmentId,
        siteId,
        legalEntityId,
        startDate,
        endDatePlanned: endDate,
        odometerStart: Number(checklist.odometerStart),
        fuelLevelStart: Number(checklist.fuelStart),
        motohoursStart: checklist.motohoursStart
          ? Number(checklist.motohoursStart)
          : null,
      });

      // 2. Активация — ДО акта приёмки: бэк принимает акт только для
      // вахты в статусе active (иначе 409).
      await shiftsApi.activate(String(shift.id));

      // 3. Акт приёмки с фото. Контракт бэка — плоские snake_case поля
      // в multipart (НЕ вложенный JSON). oilLevel/tires/моточасы бэк не
      // хранит (нет колонок в machine_acceptance) — это клиентский чек-лист,
      // блокирующий «Далее»; моточасы сохранены на самой вахте (шаг 1).
      const fd = new FormData();
      fd.append('shift_id', String(shift.id));
      fd.append('odometer_start', String(Number(checklist.odometerStart)));
      fd.append('fuel_liters', String(Number(checklist.fuelStart)));
      fd.append('exterior_ok', checklist.hasDamage === 'yes' ? '0' : '1');
      if (checklist.hasDamage === 'yes' && checklist.damageDescription.trim()) {
        fd.append('damage_notes', checklist.damageDescription.trim());
      }
      if (gps) {
        fd.append('gps_lat', String(gps.lat));
        fd.append('gps_lon', String(gps.lng));
        fd.append('gps_accuracy_m', String(gps.accuracy));
      }
      photos.forEach((p, i) => fd.append('photos', p.blob, `acceptance-${i + 1}.jpg`));

      // Подпись водителя (ПЭП): бэк ставит driver_signed=1 автоматически,
      // потому что акт создаётся под авторизованной сессией водителя.
      // Отдельный вызов /sign не нужен (вернул бы 409 «Уже подписан»).
      await apiClient.request<{ id: string }>('/api/acceptance', {
        method: 'POST',
        formData: fd,
      });

      // Освобождаем object URL'ы превью
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));

      navigate('/driver', { replace: true });
    } catch (e) {
      // Сеть оборвалась посреди цепочки: честно просим повторить (НЕ «уйдёт
      // позже» — старт смены не ставится в очередь). Данные остаются в форме.
      if (e instanceof ApiError && e.isNetwork) {
        setSubmitError(
          'Связь прервалась. Проверьте интернет и попробуйте снова — данные в форме сохранены.',
        );
      } else {
        setSubmitError(describeError(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Если хотя бы один справочник упал — общая ErrorState
  const dirError = sites.error ?? legalEntities.error ?? equipment.error;
  if (dirError) {
    return (
      <ErrorState
        title="Не удалось загрузить справочники"
        message={describeError(dirError)}
        onRetry={() => {
          void sites.refetch();
          void legalEntities.refetch();
          void equipment.refetch();
        }}
      />
    );
  }

  const steps: WizardStep[] = [
    {
      title: 'Вахта',
      canProceed: step1Valid,
      content: (
        <Step1
          sites={sites.data ?? []}
          sitesLoading={sites.isLoading}
          equipment={equipment.data ?? []}
          equipmentLoading={equipment.isLoading}
          legalEntities={legalEntities.data ?? []}
          legalEntitiesLoading={legalEntities.isLoading}
          siteId={siteId}
          onSite={setSiteId}
          equipmentId={equipmentId}
          onEquipment={setEquipmentId}
          legalEntityId={legalEntityId}
          onLegalEntity={setLegalEntityId}
          duration={duration}
          onDuration={setDuration}
        />
      ),
    },
    {
      title: 'Чек-лист приёмки',
      canProceed: step2Valid,
      content: <Step2Checklist value={checklist} onChange={setChecklist} />,
    },
    {
      title: 'Фото приёмки',
      canProceed: step3Valid,
      content: (
        <PhotoUploader
          value={photos}
          onChange={setPhotos}
          min={3}
          max={10}
          slotHints={['Вид спереди', 'Вид сзади', 'Кабина', 'Левый борт', 'Правый борт']}
        />
      ),
    },
    {
      title: 'Подтверждение и GPS',
      canProceed: step4Valid,
      content: (
        <div className="space-y-5">
          <ActConfirmation
            signerName={user?.fullName ?? 'Водитель'}
            signerPhone={user?.phone}
            actLabel="Акт приёмки техники"
            body="Подтверждаю, что осмотрел машину, заполнил чек-лист и приложил фото. Принимаю технику в зафиксированном состоянии."
            confirmed={confirmed}
            onChange={setConfirmed}
          />
          <GpsStatusBlock state={gpsState} gps={gps} />
          {submitError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {submitError}
            </div>
          )}
        </div>
      ),
    },
  ];

  const handleBack = () => {
    if (step === 0) navigate('/driver');
    else setStep(step - 1);
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      void handleSubmit();
    }
  };

  return (
    <div className="-mx-4 -mb-4 flex h-full flex-col px-4 pb-4">
      <Wizard
        steps={steps}
        current={step}
        onBack={handleBack}
        onNext={handleNext}
        submitLabel="Активировать вахту"
        submitting={submitting}
      />
    </div>
  );
}

// ============================================================================
// Step 1 — выбор объекта / техники / юрлица / длительности
// ============================================================================

interface Step1Props {
  sites: Site[];
  sitesLoading: boolean;
  equipment: Equipment[];
  equipmentLoading: boolean;
  legalEntities: LegalEntity[];
  legalEntitiesLoading: boolean;
  siteId: string | number | null;
  onSite: (id: string | number) => void;
  equipmentId: string | number | null;
  onEquipment: (id: string | number) => void;
  legalEntityId: string | number | null;
  onLegalEntity: (id: string | number) => void;
  duration: Duration;
  onDuration: (d: Duration) => void;
}

function Step1(p: Step1Props) {
  return (
    <div className="space-y-5">
      <PickerGroup label="Объект" loading={p.sitesLoading}>
        {p.sites.map((s) => (
          <PickerCard
            key={String(s.id)}
            selected={p.siteId === s.id}
            onClick={() => p.onSite(s.id)}
            title={s.name}
            subtitle={s.address}
            extra={s.customer}
          />
        ))}
      </PickerGroup>

      <PickerGroup label="Техника" loading={p.equipmentLoading}>
        {p.equipment.map((e) => (
          <PickerCard
            key={String(e.id)}
            selected={p.equipmentId === e.id}
            onClick={() => p.onEquipment(e.id)}
            title={e.regNumber}
            subtitle={e.name}
            extra={equipmentTypeLabel(e.type)}
          />
        ))}
      </PickerGroup>

      <PickerGroup label="Юрлицо" loading={p.legalEntitiesLoading}>
        {p.legalEntities.map((l) => (
          <PickerCard
            key={String(l.id)}
            selected={p.legalEntityId === l.id}
            onClick={() => p.onLegalEntity(l.id)}
            title={l.name}
            subtitle={l.inn ? `ИНН ${l.inn}` : undefined}
          />
        ))}
      </PickerGroup>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-700">Длительность вахты</p>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => p.onDuration(d)}
              className={cn(
                'min-h-tap rounded-lg border-2 px-2 py-2 text-base font-semibold transition-colors',
                p.duration === d
                  ? 'border-brand-700 bg-brand-50 text-brand-900'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
              )}
            >
              {d} дн
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PickerGroup({
  label,
  loading,
  children,
}: {
  label: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-700">{label}</p>
      <div className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function PickerCard({
  selected,
  onClick,
  title,
  subtitle,
  extra,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  extra?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border-2 bg-white px-3 py-3 text-left transition-colors',
        selected
          ? 'border-brand-700 bg-brand-50'
          : 'border-ink-200 hover:border-ink-400 hover:bg-ink-50',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
          selected ? 'border-brand-700 bg-brand-700' : 'border-ink-300',
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink-900">{title}</span>
        {subtitle && <span className="block truncate text-sm text-ink-600">{subtitle}</span>}
        {extra && <span className="mt-0.5 block text-xs text-ink-500">{extra}</span>}
      </span>
    </button>
  );
}

// ============================================================================
// Step 2 — чек-лист
// ============================================================================

function Step2Checklist({
  value,
  onChange,
}: {
  value: Checklist;
  onChange: (c: Checklist) => void;
}) {
  const set = (patch: Partial<Checklist>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <ChoiceRow
        label="Уровень масла"
        value={value.oilLevel}
        onChange={(v) => set({ oilLevel: v as Checklist['oilLevel'] })}
        options={[
          { value: 'ok', label: 'Норма', tone: 'ok' },
          { value: 'issue', label: 'Проблема', tone: 'bad' },
        ]}
      />

      <Input
        label="Топливо на приёмке, литров"
        value={value.fuelStart}
        onChange={(e) => set({ fuelStart: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder="Напр., 280"
      />

      <Input
        label="Одометр (км)"
        value={value.odometerStart}
        onChange={(e) => set({ odometerStart: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder="Напр., 145320"
      />

      <Input
        label="Моточасы (если есть в приборке)"
        value={value.motohoursStart}
        onChange={(e) => set({ motohoursStart: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder="Необязательно"
        hint="Для спецтехники моточасы — основная метрика ТО и ГСМ"
      />

      <ChoiceRow
        label="Видимые повреждения"
        value={value.hasDamage}
        onChange={(v) => set({ hasDamage: v as Checklist['hasDamage'] })}
        options={[
          { value: 'no', label: 'Нет', tone: 'ok' },
          { value: 'yes', label: 'Есть', tone: 'bad' },
        ]}
      />

      {value.hasDamage === 'yes' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Input
            label="Описание повреждений"
            value={value.damageDescription}
            onChange={(e) => set({ damageDescription: e.target.value })}
            placeholder="Что и где повреждено"
            hint="Обязательно сфотографировать на следующем шаге"
          />
        </div>
      )}

      <ChoiceRow
        label="Шины"
        value={value.tires}
        onChange={(v) => set({ tires: v as Checklist['tires'] })}
        options={[
          { value: 'ok', label: 'Норма', tone: 'ok' },
          { value: 'attention', label: 'Требуют внимания', tone: 'warn' },
        ]}
      />
    </div>
  );
}

interface ChoiceOption {
  value: string;
  label: string;
  tone: 'ok' | 'warn' | 'bad';
}

function ChoiceRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: ChoiceOption[];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-700">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-tap rounded-lg border-2 px-3 py-2.5 text-base font-medium transition-colors',
              value === opt.value
                ? toneSelected(opt.tone)
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function toneSelected(tone: 'ok' | 'warn' | 'bad'): string {
  switch (tone) {
    case 'ok':
      return 'border-emerald-600 bg-emerald-50 text-emerald-900';
    case 'warn':
      return 'border-amber-600 bg-amber-50 text-amber-900';
    case 'bad':
      return 'border-red-600 bg-red-50 text-red-900';
  }
}

// ============================================================================
// Step 4 helpers — GPS-блок
// ============================================================================

function GpsStatusBlock({
  state,
  gps,
}: {
  state: 'idle' | 'attempting' | 'ok' | 'fail';
  gps: GpsTag | null;
}) {
  return (
    <Card padded className="bg-ink-100/60">
      <p className="mb-1 text-sm font-medium text-ink-700">GPS-отметка</p>
      {state === 'attempting' && (
        <p className="text-sm text-ink-600">Ищем спутники… до 5 секунд</p>
      )}
      {state === 'ok' && gps && (
        <p className="text-sm text-emerald-800">
          ✓ Получено: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (точность ±{Math.round(gps.accuracy)} м)
        </p>
      )}
      {state === 'fail' && (
        <p className="text-sm text-ink-600">
          GPS недоступен. Это не блокирует сценарий — продолжаем без координат.
        </p>
      )}
    </Card>
  );
}

// ============================================================================
// Утилиты
// ============================================================================

function isPositiveInt(s: string): boolean {
  return /^\d+$/.test(s) && Number(s) > 0;
}

function equipmentTypeLabel(t: Equipment['type']): string {
  return EQUIPMENT_TYPE_LABEL[t];
}
