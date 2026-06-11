import { apiClient } from '@/api/client';
import type { AuthResponse, AuthUser } from '@/types/api';

/**
 * Авторизация.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   POST /api/auth/driver/login   { phone, pin } → { token, user: {id, name, phone} }
 *   POST /api/auth/operator/login { phone, pin } → { token, user: {id, name, phone, role} }
 *
 * Бэк отдаёт `name` (а не `fullName`), и для driver не возвращает явную роль.
 * Нормализуем здесь.
 */

export interface LoginPayload {
  phone: string;
  pin: string;
}

interface RawAuthResponse {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  user: {
    id: string | number;
    name?: string;
    fullName?: string;
    full_name?: string;
    phone: string;
    role?: AuthUser['role'];
  };
}

function normalize(raw: RawAuthResponse, defaultRole: AuthUser['role']): AuthResponse {
  return {
    token: raw.token,
    refreshToken: raw.refreshToken,
    expiresIn: raw.expiresIn,
    user: {
      id: raw.user.id,
      role: raw.user.role ?? defaultRole,
      fullName: raw.user.fullName ?? raw.user.full_name ?? raw.user.name ?? '',
      phone: raw.user.phone,
    },
  };
}

export interface EmployeeLoginPayload {
  fullName: string;
  password: string;
}

export const authApi = {
  /** Legacy: логин по seed-таблицам drivers/operators (phone+pin). Оставлен на переходный период. */
  driverLogin: async (payload: LoginPayload): Promise<AuthResponse> => {
    const raw = await apiClient.post<RawAuthResponse>('/api/auth/driver/login', payload);
    return normalize(raw, 'driver');
  },
  operatorLogin: async (payload: LoginPayload): Promise<AuthResponse> => {
    const raw = await apiClient.post<RawAuthResponse>('/api/auth/operator/login', payload);
    return normalize(raw, 'operator');
  },

  /**
   * Новый flow: логин по ФИО + пароль (для driver — ДДММГГГГ, для dispatcher — техпароль).
   * Бэк возвращает role в JWT-формате (driver|operator), плюс employeeRole (driver|dispatcher) для UI.
   */
  employeeLogin: async (payload: EmployeeLoginPayload): Promise<AuthResponse> => {
    const raw = await apiClient.post<RawAuthResponse & { user: { employeeRole?: 'driver' | 'dispatcher' } }>(
      '/api/employees/login',
      payload,
    );
    return normalize(raw, 'driver');
  },
};
