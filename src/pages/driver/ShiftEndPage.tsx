import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import { PhotoUploader, type UploadedPhoto } from '@/components/photo/PhotoUploader';
import { ActConfirmation } from '@/components/signature/ActConfirmation';
import { useAuthStore, selectUser } from '@/features/auth/store';
import { shiftsApi } from '@/api/endpoints/shifts';
import { submitOrQueue } from '@/offline/submit';
import { enqueue } from '@/offline/queue';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { geoSoft } from '@/lib/geo';
import type { GpsTag } from '@/types/acceptance';
import type { Shift } from '@/types/shift';

/**
 * Сдача вахты — wizard 5 шагов.
 *
 * Шаг 1: показания на сдаче (одометр, топливо, моточасы) — каждое ≥ старта.
 * Шаг 2: фото сдачи 3–10 с подсказками ракурсов.
 * Шаг 3: фото рапортов 0–10 (опционально, бумажный сменный рапорт).
 * Шаг 4: подпись водителя.
 * Шаг 5: подпись представителя (ФИО, должность) + GPS soft + submit.
 *
 * Submit-цепочка:
 *   POST /api/acceptance/:shiftId/return  (multipart: плоские snake_case метрики
 *     + фото + ФИО/должность представителя + GPS; driver_signed бэк ставит сам)
 *   POST /api/shifts/:shiftId/complete   → pending_verification
 *
 * assumption #1: `POST /api/acceptance/:shiftId/return` принимает shiftId в URL
 * (подтверждено кодом бэка 2026-06-11 — там все маршруты актов по :shift_id).
 *
 * assumption #2: одна сессия / одно устройство для обеих подписей. Бригадир
 * передаёт планшет представителю объекта на 5-м шаге. Это согласуется с
 * KIP_RESEARCH §3.6 — отдельный экран представителя через QR — фича v2.
 *
 * assumption #3: GPS soft — пробуем 5 секунд, не блокируем сценарий.
 *
 * GPS пытаемся фоном при входе на шаг 5.
 */

interface ReadingsForm {
  odometerEnd: string;
  fuelEndLiters: string;
  motohoursEnd: string;
}

const emptyReadings: ReadingsForm = {
  odometerEnd: '',
  fuelEndLiters: '',
  motohoursEnd: '',
};

interface RepresentativeForm {
  fullName: string;
  position: string;
}

const emptyRepresentative: RepresentativeForm = {
  fullName: '',
  position: '',
};

export function ShiftEndPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const shiftId = id ?? '';

  const shift = useAsync(() => shiftsApi.byId(shiftId), [shiftId]);

  const [step, setStep] = useState(0);

  // Шаг 1
  const [readings, setReadings] = useState<ReadingsForm>(emptyReadings);

  // Шаг 2 — фото сдачи
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  // Шаг 3 — фото рапортов (опционально)
  const [reportPhotos, setReportPhotos] = useState<UploadedPhoto[]>([]);

  // Шаг 4 — подпись водителя
  const user = useAuthStore(selectUser);
  const [driverConfirmed, setDriverConfirmed] = useState(false);

  // Шаг 5 — представитель и GPS
  const [repConfirmed, setRepConfirmed] = useState(false);
  const [representative, setRepresentative] = useState<RepresentativeForm>(emptyRepresentative);
  const [gps, setGps] = useState<GpsTag | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'attempting' | 'ok' | 'fail'>('idle');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // GPS-попытка при входе на шаг 5
  useEffect(() => {
    if (step !== 4 || gpsState !== 'idle') return;
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

  // Валидация шагов
  const step1Valid = useMemo(() => {
    if (!shift.data) return false;
    const r = readings;
    if (!isPositiveInt(r.odometerEnd) || !isPositiveInt(r.fuelEndLiters)) return false;
    const odoStart = shift.data.odometerStart ?? 0;
    const fuelStart = shift.data.fuelLevelStart ?? 0;
    if (Number(r.odometerEnd) < odoStart) return false;
    // Топливо может уменьшиться (часть израсходовано) или вырасти (заправка) —
    // не блокируем по сравнению со стартом. Только что число валидное.
    void fuelStart;
    if (r.motohoursEnd) {
      const mhStart = shift.data.motohoursStart ?? 0;
      if (!isPositiveInt(r.motohoursEnd)) return false;
      if (Number(r.motohoursEnd) < mhStart) return false;
    }
    return true;
  }, [readings, shift.data]);

  const step2Valid = photos.length >= 3;
  const step3Valid = true; // опционально
  const step4Valid = driverConfirmed;
  const step5Valid = repConfirmed && representative.fullName.trim().length >= 3;

  async function handleSubmit() {
    if (!shift.data) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // 1. Акт сдачи (multipart). Контракт бэка — плоские snake_case поля,
      // НЕ вложенный JSON. Подпись водителя (ПЭП) бэк ставит автоматически
      // (driver_signed=1 — акт создаётся под сессией водителя), ФИО/должность
      // представителя фиксируются полями акта — отдельные /return/sign
      // не нужны (вернули бы 409 «Уже подписан»).
      // Моточасы-конец бэк в machine_return не хранит (нет колонки) —
      // известное ограничение, поле остаётся в UI для будущего расширения.
      const fd = new FormData();
      fd.append('odometer_end', String(Number(readings.odometerEnd)));
      fd.append('fuel_liters', String(Number(readings.fuelEndLiters)));
      fd.append('representative_full_name', representative.fullName.trim());
      if (representative.position.trim()) {
        fd.append('representative_position', representative.position.trim());
      }
      if (gps) {
        fd.append('gps_lat', String(gps.lat));
        fd.append('gps_lon', String(gps.lng));
        fd.append('gps_accuracy_m', String(gps.accuracy));
      }
      photos.forEach((p, i) => fd.append('photos', p.blob, `return-${i + 1}.jpg`));
      // Фото бумажных сменных рапортов — отдельным полем report_photos. Бэк
      // сохраняет их в category reports и пишет id в damage_photos → оператор
      // видит их как «Рапорты». (Раньше молча выбрасывались.)
      reportPhotos.forEach((p, i) => fd.append('report_photos', p.blob, `report-${i + 1}.jpg`));

      // 1. Акт сдачи — офлайн-безопасно: при отсутствии связи фото+метрики
      // лягут в очередь и дошлются позже (смена уже существует, shiftId реальный).
      const ret = await submitOrQueue({
        url: `/api/acceptance/${shiftId}/return`,
        method: 'POST',
        formData: fd,
        entityType: 'return',
        entityId: shiftId,
      });

      // 2. Перевод вахты в pending_verification. Если акт ушёл в очередь —
      // complete ТОЖЕ кладём в очередь (после акта, FIFO по createdAt), иначе
      // complete мог бы прийти на сервер раньше акта сдачи.
      if (ret.queued) {
        await enqueue({
          op: 'POST',
          url: `/api/shifts/${shiftId}/complete`,
          body: { kind: 'none' },
          entityId: shiftId,
        });
      } else {
        await submitOrQueue({
          url: `/api/shifts/${shiftId}/complete`,
          method: 'POST',
          entityId: shiftId,
        });
      }

      // Освобождаем object URL'ы превью
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      reportPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));

      navigate('/driver', { replace: true });
    } catch (e) {
      setSubmitError(describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Загрузка вахты
  if (shift.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (shift.error || !shift.data) {
    return (
      <ErrorState
        title="Не удалось загрузить вахту"
        message={describeError(shift.error ?? new Error('Вахта не найдена'))}
        onRetry={() => void shift.refetch()}
      />
    );
  }

  const steps: WizardStep[] = [
    {
      title: 'Показания на сдаче',
      canProceed: step1Valid,
      content: (
        <Step1Readings
          shift={shift.data}
          value={readings}
          onChange={setReadings}
        />
      ),
    },
    {
      title: 'Фото сдачи',
      canProceed: step2Valid,
      content: (
        <PhotoUploader
          value={photos}
          onChange={setPhotos}
          min={3}
          max={10}
          slotHints={[
            'Вид спереди',
            'Вид сзади',
            'Кабина',
            'Левый борт',
            'Правый борт',
            'Одометр / приборка',
          ]}
        />
      ),
    },
    {
      title: 'Фото сменных рапортов',
      canProceed: step3Valid,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Сфотографируйте бумажные рапорты, если они есть. Шаг можно пропустить.
          </p>
          <PhotoUploader
            value={reportPhotos}
            onChange={setReportPhotos}
            min={0}
            max={10}
          />
        </div>
      ),
    },
    {
      title: 'Подтверждение водителя',
      canProceed: step4Valid,
      content: (
        <ActConfirmation
          signerName={user?.fullName ?? 'Водитель'}
          signerPhone={user?.phone}
          actLabel="Акт сдачи техники"
          body="Подтверждаю показания на сдаче и приложенные фото. Сдаю машину в зафиксированном состоянии."
          confirmed={driverConfirmed}
          onChange={setDriverConfirmed}
        />
      ),
    },
    {
      title: 'Подтверждение представителя',
      canProceed: step5Valid,
      content: (
        <div className="space-y-5">
          <Card padded className="bg-amber-50/50 border-amber-200">
            <p className="text-sm font-medium text-amber-900">
              Передайте устройство представителю объекта.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Он(а) проверяет показания и фото сдачи, заполняет ФИО и подтверждает приём.
            </p>
          </Card>

          <Input
            label="ФИО представителя"
            value={representative.fullName}
            onChange={(e) =>
              setRepresentative({ ...representative, fullName: e.target.value })
            }
            placeholder="Иванов Иван Иванович"
            autoComplete="off"
          />
          <Input
            label="Должность (необязательно)"
            value={representative.position}
            onChange={(e) =>
              setRepresentative({ ...representative, position: e.target.value })
            }
            placeholder="Прораб / мастер участка"
            autoComplete="off"
          />

          <ActConfirmation
            signerName={representative.fullName.trim() || '(укажите ФИО выше)'}
            actLabel="Приём техники представителем"
            body="Принял технику. Показания и фото сверены, претензий нет."
            confirmed={repConfirmed}
            onChange={setRepConfirmed}
            hint="Заполните ФИО и поставьте галочку — без этого акт не оформится."
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
    if (step === 0) navigate(`/driver/shift/${shiftId}`);
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
        submitLabel="Сдать на проверку"
        submitting={submitting}
      />
    </div>
  );
}

// ============================================================================
// Шаг 1 — показания на сдаче
// ============================================================================

function Step1Readings({
  shift,
  value,
  onChange,
}: {
  shift: Shift;
  value: ReadingsForm;
  onChange: (v: ReadingsForm) => void;
}) {
  const set = (patch: Partial<ReadingsForm>) => onChange({ ...value, ...patch });

  const odoStart = shift.odometerStart ?? 0;
  const fuelStart = shift.fuelLevelStart ?? 0;
  const mhStart = shift.motohoursStart;

  const odoErr =
    value.odometerEnd && Number(value.odometerEnd) < odoStart
      ? `Не может быть меньше старта (${odoStart})`
      : undefined;
  const mhErr =
    value.motohoursEnd && mhStart != null && Number(value.motohoursEnd) < mhStart
      ? `Не может быть меньше старта (${mhStart})`
      : undefined;

  return (
    <div className="space-y-5">
      <Card padded className="bg-ink-100/60">
        <p className="text-xs uppercase tracking-wide text-ink-500">На приёмке было</p>
        <div className="mt-1 grid grid-cols-3 gap-3 text-sm">
          <Metric label="Одометр" value={`${odoStart} км`} />
          <Metric label="Топливо" value={`${fuelStart} л`} />
          <Metric label="Моточасы" value={mhStart != null ? `${mhStart}` : '—'} />
        </div>
      </Card>

      <Input
        label="Одометр на сдаче, км"
        value={value.odometerEnd}
        onChange={(e) => set({ odometerEnd: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder={`Напр., ${odoStart + 150}`}
        error={odoErr}
        hint={!odoErr ? `Минимум: ${odoStart}` : undefined}
      />

      <Input
        label="Топливо на сдаче, литров"
        value={value.fuelEndLiters}
        onChange={(e) => set({ fuelEndLiters: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder="Напр., 120"
        hint="Если заправляли — укажите фактический остаток сейчас"
      />

      <Input
        label="Моточасы на сдаче"
        value={value.motohoursEnd}
        onChange={(e) => set({ motohoursEnd: e.target.value.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder={mhStart != null ? `Минимум: ${mhStart}` : 'Необязательно'}
        error={mhErr}
        hint={
          !mhErr
            ? mhStart != null
              ? `Старт: ${mhStart}`
              : 'Если есть в приборке'
            : undefined
        }
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-base font-semibold text-ink-900">{value}</div>
    </div>
  );
}

// ============================================================================
// GPS-блок (компактный)
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
          ✓ Получено: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (точность ±
          {Math.round(gps.accuracy)} м)
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
  return /^\d+$/.test(s) && Number(s) >= 0;
}
