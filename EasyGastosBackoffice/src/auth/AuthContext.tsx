import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { request, ApiError } from '../api/http';
import type { AdminUser } from '../types/catalogs';

const STORAGE_KEY = 'easygastos.backoffice.session';

interface Session {
  token: string;
  user: AdminUser;
}

interface LoginResponse extends Session {
  message: string;
}

interface AuthValue {
  token: string | null;
  user: AdminUser | null;
  login: (email: string, pin: string) => Promise<void>;
  logout: () => void;
}

const loadSession = (): Session | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as Session : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback(async (email: string, pin: string) => {
    const response = await request<LoginResponse>('/api/users/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), pin }
    });
    if (!response.user.isAdmin) {
      throw new ApiError(403, 'ADMIN_REQUIRED', 'El usuario no tiene habilitado el rol administrador.');
    }
    const next = { token: response.token, user: response.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    token: session?.token || null,
    user: session?.user || null,
    login,
    logout
  }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
};
