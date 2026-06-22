import type { ApiErrorPayload } from '@/types/api';

/**
 * Единый класс ошибок API.
 * Сообщения уже локализованы в коде вызывающего слоя — здесь только данные.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly payload?: ApiErrorPayload;
  readonly isNetwork: boolean;

  constructor(message: string, status: number, payload?: ApiErrorPayload, isNetwork = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.isNetwork = isNetwork;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isServer() {
    return this.status >= 500;
  }
}

/**
 * Перевод ошибки в человеческое сообщение.
 * Этот маппинг — единая точка правды для UI-уровня.
 */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return 'Нет связи с сервером. Данные будут отправлены позже.';
    // Бэк присылает причину в поле `error` (иногда `message`) — показываем её:
    // она информативнее общих фраз (напр. «Вахта не активна», «День на эту дату
    // уже внесён»). Раньше брали только `message` → пользователь видел generic.
    const backendMsg = err.payload?.message || err.payload?.error;
    switch (err.status) {
      case 400:
        return backendMsg || 'Некорректный запрос';
      case 401:
        return 'Войдите снова';
      case 403:
        return backendMsg || 'Нет доступа к этому действию';
      case 404:
        return backendMsg || 'Не найдено';
      case 409:
        return backendMsg || 'Данные изменились, обновите экран';
      case 422:
        return backendMsg || 'Проверьте введённые данные';
      case 429:
        return backendMsg || 'Слишком много запросов. Подождите немного.';
      default:
        if (err.status >= 500) return 'Сервер недоступен. Данные будут отправлены позже.';
        return backendMsg || err.message || 'Неизвестная ошибка';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Неизвестная ошибка';
}
