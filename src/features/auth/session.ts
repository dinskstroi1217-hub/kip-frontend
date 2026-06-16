import type { AuthUser } from '@/types/api';

/**
 * Хранение access token и пользователя в localStorage.
 *
 * localStorage (а не sessionStorage), чтобы вход ПЕРЕЖИВАЛ перезапуск приложения:
 * в standalone-PWA и в APK (Capacitor WebView) sessionStorage стирается при каждом
 * холодном старте → водителя выкидывало на логин. Пароль = дата рождения
 * (низкочувствительный секрет), вход защищён серверным лимитом попыток — компромисс
 * по XSS приемлем. (Идеал на будущее: Capacitor Preferences / httpOnly-cookie +
 * refresh-токен в IndexedDB.)
 */

const TOKEN_KEY = 'kip.auth.token';
const USER_KEY = 'kip.auth.user';

export interface PersistedSession {
  token: string;
  user: AuthUser;
}

export function readSession(): PersistedSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (!token || !userJson) return null;
    const user = JSON.parse(userJson) as AuthUser;
    return { token, user };
  } catch {
    return null;
  }
}

export function writeSession(session: PersistedSession): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
