import { newId } from '@/lib/uuid';
import { ApiError } from './errors';
import type { ApiErrorPayload } from '@/types/api';

/**
 * Минималистичный API-клиент.
 *
 * Принципы:
 *  - В dev обращаемся через относительные пути `/api/...`, Vite-proxy разруливает.
 *    В проде nginx делает то же. Это снимает CORS-возню.
 *  - Токен берём из колбэка (внедряет auth-store), без прямой связи с сторами.
 *  - 401 — выкидываем событие logout (auth-store слушает), бросаем ApiError.
 *  - Idempotency-Key для всех мутаций (assumption: backend либо учитывает,
 *    либо игнорирует — не ломается). Ключ = UUIDv7.
 *  - Refresh-token абстракция готова; пока endpoint не описан — silent skip.
 */

export interface ApiClientConfig {
  /** Базовый префикс. По умолчанию пустой — обращаемся к origin (для dev/proxy и nginx). */
  basePath?: string;
  /** Геттер access-токена. */
  getToken?: () => string | null;
  /** Колбэк попытки обновить токен. Возвращает новый access или null. */
  refresh?: () => Promise<string | null>;
  /** Колбэк при безусловном выходе (401 после refresh). */
  onUnauthorized?: () => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart — если передаётся FormData, заголовки не выставляем. */
  formData?: FormData;
  /** Доп. заголовки. */
  headers?: Record<string, string>;
  /** Передавать ли Idempotency-Key (по умолчанию true для мутаций). */
  idempotent?: boolean;
  /** AbortSignal. */
  signal?: AbortSignal;
  /** Не пытаться refresh при 401. */
  skipRefresh?: boolean;
}

export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig = {}) {
    this.config = config;
  }

  /**
   * Перенастроить клиент (используется в Providers при старте,
   * чтобы внедрить токен-геттер и refresh-колбэк без круговой зависимости).
   */
  configure(patch: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Полный URL для тегов <img src=...>, <a href=...> и т.п.
   * Применяет basePath (CF Worker URL в проде, относительный путь в dev).
   */
  absoluteUrl(path: string): string {
    return (this.config.basePath ?? '') + path;
  }

  /**
   * Бинарный GET с Authorization (для картинок: <img> не умеет слать
   * заголовки, а /api/photos/:id требует токен → грузим fetch'ем в blob).
   */
  async fetchBlob(path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    const token = this.config.getToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch((this.config.basePath ?? '') + path, { headers });
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, response.status, undefined, false);
    }
    return response.blob();
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? 'GET';
    const url = (this.config.basePath ?? '') + path;
    const isMutation = method !== 'GET';
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };

    let body: BodyInit | undefined;
    if (opts.formData) {
      body = opts.formData;
      // браузер сам выставит boundary
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(opts.body);
    }

    const token = this.config.getToken?.();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (isMutation && (opts.idempotent ?? true)) {
      headers['Idempotency-Key'] = headers['Idempotency-Key'] ?? newId();
    }

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: opts.signal });
    } catch (e) {
      // Сетевая ошибка
      throw new ApiError(
        e instanceof Error ? e.message : 'Network error',
        0,
        undefined,
        true,
      );
    }

    // 401 → пробуем refresh один раз
    if (response.status === 401 && !opts.skipRefresh && this.config.refresh) {
      const newToken = await this.config.refresh().catch(() => null);
      if (newToken) {
        return this.request<T>(path, { ...opts, skipRefresh: true });
      }
      this.config.onUnauthorized?.();
    }

    if (!response.ok) {
      const payload = await this.parseErrorPayload(response);
      throw new ApiError(payload?.message || payload?.error || response.statusText, response.status, payload);
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    // На всякий случай — возвращаем как текст
    return (await response.text()) as unknown as T;
  }

  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body' | 'formData'>) {
    return this.request<T>(path, { ...opts, method: 'GET' });
  }
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  }
  patch<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'PATCH', body });
  }
  put<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'PUT', body });
  }
  delete<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body' | 'formData'>) {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  }

  private async parseErrorPayload(res: Response): Promise<ApiErrorPayload | undefined> {
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) return (await res.json()) as ApiErrorPayload;
      const text = await res.text();
      return text ? { message: text } : undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Singleton-клиент. Колбэки внедряются из app/providers при старте.
 */
export const apiClient = new ApiClient();
