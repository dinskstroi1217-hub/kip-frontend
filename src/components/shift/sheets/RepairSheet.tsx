import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PhotoUploader, type UploadedPhoto } from '@/components/photo/PhotoUploader';
import { incidentsApi } from '@/api/endpoints/incidents';
import { describeError } from '@/api/errors';
import type { Incident } from '@/types/incident';

/**
 * Ремонт. Создаёт incident с типом 'repair'. Фото поломки — обязательно.
 * Бэк по факту:
 *   - меняет статус вахты на issue_repair
 *   - шлёт в MAX-группу транспортного отдела
 *   - показывает 🔴 у оператора
 */

interface RepairSheetProps {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  onSuccess: (inc: Incident) => void;
}

export function RepairSheet({ open, onClose, shiftId, onSuccess }: RepairSheetProps) {
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = description.trim().length >= 5 && photos.length >= 1;

  function reset() {
    setDescription('');
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setError(null);
  }

  async function handleSubmit() {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      // multipart с фото поломки — офлайн-безопасно (очередь дошлёт при связи).
      const inc = await incidentsApi.createWithPhotos({
        shiftId,
        type: 'repair',
        description: description.trim(),
        photos: photos.map((p) => p.blob),
      });

      onSuccess(inc);
      reset();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (submitting) return;
        reset();
        onClose();
      }}
      title="Сообщить о поломке"
      description="Уведомление транспортному отделу уйдёт сразу"
      footer={
        <Button fullWidth size="xl" loading={submitting} disabled={!valid} onClick={handleSubmit}>
          Отправить
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Описание поломки
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Что сломалось, при каких обстоятельствах"
            className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <PhotoUploader value={photos} onChange={setPhotos} min={1} max={6} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
