import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('rentora_token'));
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (tkn) => {
    try {
      const res = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      setUser(res.data.user);
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem('rentora_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchMe(token);
    } else {
      setLoading(false);
    }
  }, [token, fetchMe]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: tkn, user: u } = res.data;
    localStorage.setItem('rentora_token', tkn);
    setToken(tkn);
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    const { token: tkn, user: u } = res.data;
    localStorage.setItem('rentora_token', tkn);
    setToken(tkn);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('rentora_token');
    setToken(null);
    setUser(null);
  };

  const value = { user, token, loading, login, register, logout, isLandlord: user?.role === 'LANDLORD', isTenant: user?.role === 'TENANT' };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
