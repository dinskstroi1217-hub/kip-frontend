/**
 * Общие типы для API.
 *
 * ВНИМАНИЕ (assumption): точная форма успешных и ошибочных ответов backend
 * не подтверждена документацией. Мы делаем разумные предположения, помечаем
 * как `assumption` и при первом несовпадении правим в одном месте.
 */

/**
 * Ответ /api/auth/(driver|operator)/login.
 * assumption: backend возвращает плоский `token` (JWT) и поле `user`.
 * Если на самом деле ответ другой формы — поправить здесь и в api/endpoints/auth.ts.
 */
export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
  expiresIn?: number;
}

/**
 * assumption: backend в payload login возвращает user'а с явной ролью.
 * Если роль приходит только через JWT-claims — добавим декодер.
 */
export interface AuthUser {
  id: string | number;
  role: 'driver' | 'operator' | 'mechanic' | 'accountant' | 'admin';
  fullName: string;
  phone: string;
}

export interface ApiErrorPayload {
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
}
