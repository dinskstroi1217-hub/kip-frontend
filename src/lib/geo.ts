/**
 * GPS в «мягком режиме»: пробуем 5 секунд, если не получили — возвращаем null.
 * НЕ блокируем сценарий — на стройке/в карьере GPS часто глушится.
 *
 * Источник правила: TZ.md (ключевое решение 7), KIP_RESEARCH.md §3.9.
 */
import type { GpsTag } from '@/types/acceptance';

export interface GeoSoftOptions {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
}

export async function geoSoft({
  timeoutMs = 5000,
  enableHighAccuracy = true,
}: GeoSoftOptions = {}): Promise<GpsTag | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return null;
  }

  return new Promise<GpsTag | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
