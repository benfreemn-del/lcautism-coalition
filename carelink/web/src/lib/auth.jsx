// Auth context for the SPA (wraps the stub JWT). Maps to Cognito later.
import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.get('/auth/me')
      .then(setStaff)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, staff } = await api.post('/auth/login', { email, password });
    setToken(token);
    setStaff(staff);
  }
  function logout() {
    setToken(null);
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
