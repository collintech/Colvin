import { createContext, useContext, useMemo, useState } from 'react';
import { clearSession, getSession, setSession } from '../../services/tokenStore.js';
import { logoutRequest } from './auth.api.js';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setState] = useState(() => getSession());
  const save = (value) => {
    setSession(value);
    setState(value);
  };
  const logout = async () => {
    try {
      if (session?.refreshToken) await logoutRequest(session.refreshToken);
    } finally {
      clearSession();
      setState(null);
    }
  };
  const value = useMemo(
    () => ({
      session,
      user: session?.user,
      isAuthenticated: Boolean(session?.accessToken),
      save,
      logout,
    }),
    [session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
