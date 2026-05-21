import type { AuthUser } from '@/types/api';

/**
 * Хранение access token и пользователя в sessionStorage.
 *
 * sessionStorage выбран потому что:
 *   - Не уязвим для долгоживущих XSS-стейлинг-атак между табами/сессиями
 *     так, как localStorage (теряется при закрытии вкладки).
 *   - В production хорошее решение — httpOnly cookies; sessionStorage
 *     — компромисс на MVP, пока контракт refresh не описан backend'ом.
 *
 * Refresh token (если/когда появится) хранить в IndexedDB, не здесь.
 */

const TOKEN_KEY = 'kip.auth.token';
const USER_KEY = 'kip.auth.user';

export interface PersistedSession {
  token: string;
  user: AuthUser;
}

export function readSession(): PersistedSession | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const userJson = sessionStorage.getItem(USER_KEY);
    if (!token || !userJson) return null;
    const user = JSON.parse(userJson) as AuthUser;
    return { token, user };
  } catch {
    return null;
  }
}

export function writeSession(session: PersistedSession): void {
  sessionStorage.setItem(TOKEN_KEY, session.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
