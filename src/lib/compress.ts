import imageCompression from 'browser-image-compression';

/**
 * Сжатие фото на клиенте перед загрузкой.
 *
 * Цели:
 *   - Максимум 1.5 МБ на файл (3G-friendly).
 *   - Длинная сторона 1920 px (мы видели в research'е что больше — не
 *     даёт практической пользы для документации, только грузит канал).
 *   - WebWorker по умолчанию — не лочим UI-поток.
 *
 * Возвращает новый Blob (JPEG) с метаданными.
 */

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  sizeBefore: number;
  sizeAfter: number;
  mime: string;
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.78,
  });

  // Берём реальные размеры через decode
  const dims = await getImageDimensions(compressed);

  return {
    blob: compressed,
    width: dims.width,
    height: dims.height,
    sizeBefore: file.size,
    sizeAfter: compressed.size,
    mime: 'image/jpeg',
  };
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dims;
}
