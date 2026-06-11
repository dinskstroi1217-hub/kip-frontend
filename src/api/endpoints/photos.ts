import { apiClient } from '@/api/client';

/**
 * Локальный photo storage (Docker volume `kip-driver-uploads` на бэке).
 *
 * Бэк хранит файлы в `/app/uploads/<regNumber>/<YYYY-MM>/shift-<id>__<Фамилия>/<категория>/<NN>.jpg`
 * и таблицу `photos` (id, shift_id, category, path, ...).
 *
 * Endpoints:
 *   GET /api/photos/:id              — отдаёт сам файл (с auth-check)
 *   GET /api/photos/by-shift/:id     — JSON со ссылками, сгруппированный по категориям
 */

export type PhotoCategory = 'acceptance' | 'return' | 'reports' | 'receipts' | 'incidents';

export interface PhotoItem {
  id: number;
  url: string;          // относительный, например /api/photos/123
  originalName: string;
  createdAt: string;
}

export type PhotosByShift = Record<PhotoCategory, PhotoItem[]>;

interface RawByShift {
  data: PhotosByShift;
}

export const photosApi = {
  /**
   * Получить все фото по вахте, сгруппированные по категориям.
   * Использовать в VerifyShiftPage (operator) и в детальных вьюхах driver'а.
   */
  byShift: async (shiftId: string | number): Promise<PhotosByShift> => {
    const r = await apiClient.get<RawByShift>(`/api/photos/by-shift/${shiftId}`);
    return r.data ?? {
      acceptance: [],
      return: [],
      reports: [],
      receipts: [],
      incidents: [],
    };
  },

  /**
   * Полный URL к картинке для тега <img src={...}>.
   * basePath берётся из apiClient (VITE_API_BASE_URL в проде → CF Worker).
   * ВНИМАНИЕ: прямой <img src> на этот URL вернёт 401 — эндпоинт требует
   * Authorization. Для отображения используй fetchImageUrl (blob с токеном).
   */
  imageUrl: (photoId: number): string => apiClient.absoluteUrl(`/api/photos/${photoId}`),

  /**
   * Object-URL картинки, загруженной fetch'ем с Authorization.
   * Кэш на сессию — повторные открытия той же вахты не перekaчивают файлы.
   */
  fetchImageUrl: async (photoId: number): Promise<string> => {
    const hit = imageCache.get(photoId);
    if (hit) return hit;
    const blob = await apiClient.fetchBlob(`/api/photos/${photoId}`);
    const url = URL.createObjectURL(blob);
    imageCache.set(photoId, url);
    return url;
  },
};

const imageCache = new Map<number, string>();
