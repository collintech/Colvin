import { useCallback, useMemo, useState } from 'react';
import { clearSession, getSession, setSession } from '../../services/tokenStore.js';
import { logoutRequest } from './auth.api.js';
import { AuthContext } from './auth-context.js';

export function AuthProvider({ children }) {
  const [session, setState] = useState(() => getSession());

  const save = useCallback((value) => {
    setSession(value);
    setState(value);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (session?.refreshToken) {
        await logoutRequest(session.refreshToken);
      }
    } finally {
      clearSession();
      setState(null);
    }
  }, [session?.refreshToken]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user,
      isAuthenticated: Boolean(session?.accessToken),
      save,
      logout,
    }),
    [logout, save, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
