import { create } from 'zustand';
import type { AuthResponse, AuthUser } from '@/types/api';
import { clearSession, readSession, writeSession } from './session';

type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;

  /** Восстановить сессию из storage. Вызывается один раз на старте. */
  restore: () => void;

  /** Сохранить ответ login и пометить authenticated. */
  setSession: (resp: AuthResponse) => void;

  /** Чистый logout — стирает сессию и переключает на unauthenticated. */
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  token: null,
  user: null,

  restore: () => {
    set({ status: 'restoring' });
    const persisted = readSession();
    if (persisted) {
      set({ status: 'authenticated', token: persisted.token, user: persisted.user });
    } else {
      set({ status: 'unauthenticated', token: null, user: null });
    }
  },

  setSession: (resp) => {
    writeSession({ token: resp.token, user: resp.user });
    set({ status: 'authenticated', token: resp.token, user: resp.user });
  },

  logout: () => {
    clearSession();
    set({ status: 'unauthenticated', token: null, user: null });
  },
}));

/**
 * Селекторы — снижают ре-рендеры, экспортируем именованно.
 */
export const selectToken = (s: AuthState) => s.token;
export const selectUser = (s: AuthState) => s.user;
export const selectRole = (s: AuthState) => s.user?.role ?? null;
export const selectIsAuthenticated = (s: AuthState) => s.status === 'authenticated';
