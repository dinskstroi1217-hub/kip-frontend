import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { compressPhoto, type CompressedPhoto } from '@/lib/compress';
import { newId } from '@/lib/uuid';

/**
 * Загрузчик фотографий с клиент-сжатием.
 *
 * UX:
 *   - Crowd-control: `min`/`max` фото.
 *   - Снимок прямо из камеры (`capture="environment"`).
 *   - Каждое фото сжимается в WebWorker'е (browser-image-compression).
 *   - Превью с возможностью удалить.
 *   - Показывает размер до/после, чтобы было понятно что сжатие работает.
 *   - Ошибка обработки помечает конкретное фото — остальные продолжают работать.
 *
 * В этом компоненте состояние локальное. Очередь отправки на сервер
 * добавляется в parent при submit (через `offline/photos.ts`).
 */

export interface UploadedPhoto extends CompressedPhoto {
  id: string;
  originalName: string;
  previewUrl: string;
}

interface PhotoUploaderProps {
  value: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  min?: number;
  max?: number;
  /** Подсказки/шаблоны на каждый слот (например, "Вид спереди"). */
  slotHints?: string[];
}

export function PhotoUploader({
  value,
  onChange,
  min = 3,
  max = 10,
  slotHints,
}: PhotoUploaderProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setProcessing(true);
      const incoming: UploadedPhoto[] = [];
      try {
        const room = Math.max(0, max - value.length);
        const slice = Array.from(files).slice(0, room);
        for (const f of slice) {
          try {
            const compressed = await compressPhoto(f);
            incoming.push({
              ...compressed,
              id: newId(),
              originalName: f.name,
              previewUrl: URL.createObjectURL(compressed.blob),
            });
          } catch (e) {
            setError(`Не удалось обработать «${f.name}»: ${e instanceof Error ? e.message : 'ошибка'}`);
          }
        }
        if (incoming.length > 0) onChange([...value, ...incoming]);
      } finally {
        setProcessing(false);
        // сбрасываем оба input, чтобы повторный выбор того же файла сработал
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
      }
    },
    [value, max, onChange],
  );

  const handleRemove = (id: string) => {
    const removed = value.find((p) => p.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onChange(value.filter((p) => p.id !== id));
  };

  const canAddMore = value.length < max;
  const nextHint = slotHints?.[value.length];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-700">
          Фото: <span className="font-semibold text-ink-900">{value.length}</span> / {min}–{max}
        </p>
        {processing && (
          <span className="inline-flex items-center gap-1 text-sm text-ink-500">
            <Spinner size="sm" /> сжимаем…
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {value.map((p, idx) => (
          <figure
            key={p.id}
            className="group relative overflow-hidden rounded-xl border border-ink-200 bg-ink-100"
          >
            <img
              src={p.previewUrl}
              alt={`Фото ${idx + 1}`}
              className="block aspect-square w-full object-cover"
              loading="lazy"
            />
            <figcaption className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-2 py-1 text-xs text-white">
              <span>
                #{idx + 1} · {formatKB(p.sizeAfter)} КБ
              </span>
            </figcaption>
            <button
              type="button"
              onClick={() => handleRemove(p.id)}
              className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white opacity-90 transition-opacity hover:bg-red-600"
              aria-label={`Удалить фото ${idx + 1}`}
            >
              ×
            </button>
          </figure>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className={cn(
              'flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-ink-300 bg-white text-center text-sm font-medium text-ink-700 transition-colors',
              'hover:border-brand-500 hover:bg-brand-50 active:bg-brand-100',
            )}
          >
            <span>
              📷 Снять
              {nextHint && (
                <>
                  <br />
                  <span className="text-xs text-ink-500">{nextHint}</span>
                </>
              )}
            </span>
          </button>
        )}
      </div>

      {canAddMore && (
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-300 bg-white px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 active:bg-ink-100"
        >
          🖼 Выбрать из галереи
        </button>
      )}

      {/* Камера: capture='environment' → сразу камера. Галерея: без capture → выбор из файлов/галереи. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void handleAdd(e.target.files)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleAdd(e.target.files)}
      />

      {value.length < min && (
        <p className="text-sm text-amber-700">Нужно минимум {min} фото.</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
          <Button
            variant="ghost"
            size="md"
            onClick={() => setError(null)}
            type="button"
            className="ml-2"
          >
            Закрыть
          </Button>
        </div>
      )}
    </div>
  );
}

function formatKB(bytes: number): string {
  return (bytes / 1024).toFixed(0);
}
