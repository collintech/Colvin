import { useCallback, useEffect, useMemo, useState } from 'react';

import { clearSession, getSession, setSession } from '../../services/tokenStore.js';
import { logoutRequest, refreshRequest } from './auth.api.js';
import { AuthContext } from './auth-context.js';

export function AuthProvider({ children }) {
  const [session, setState] = useState(() => getSession());
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const save = useCallback((value) => {
    setSession(value);
    setState(value);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
      setState(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    refreshRequest()
      .then((value) => {
        if (active) save(value);
      })
      .catch(() => {
        if (active) {
          clearSession();
          setState(null);
        }
      })
      .finally(() => {
        if (active) setIsBootstrapping(false);
      });

    return () => {
      active = false;
    };
  }, [save]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user,
      isAuthenticated: Boolean(session?.accessToken),
      isBootstrapping,
      save,
      logout,
    }),
    [isBootstrapping, logout, save, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
