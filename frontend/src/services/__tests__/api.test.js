import { describe, it, expect, beforeEach } from 'vitest';
import api, { isAuthEndpoint, onAuthPage } from '../api';

const rejectedHandler = () => api.interceptors.response.handlers[0].rejected;

function setLocation(pathname) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: `http://localhost${pathname}`, pathname },
  });
}

describe('api 401 handling', () => {
  beforeEach(() => {
    localStorage.setItem('rentora_token', 'tok');
  });

  it('classifies the auth endpoints and the auth pages', () => {
    expect(isAuthEndpoint({ url: '/auth/login' })).toBe(true);
    expect(isAuthEndpoint({ url: '/auth/register' })).toBe(true);
    expect(isAuthEndpoint({ url: '/auth/me' })).toBe(true);
    expect(isAuthEndpoint({ url: '/tenants' })).toBe(false);
    expect(isAuthEndpoint(undefined)).toBe(false);
    expect(onAuthPage('/login')).toBe(true);
    expect(onAuthPage('/signup/tenant')).toBe(true);
    expect(onAuthPage('/dashboard')).toBe(false);
  });

  it('hands a failed login back to the form: no token change, no navigation', async () => {
    setLocation('/login');
    const err = { response: { status: 401, data: { error: 'Invalid email or password' } }, config: { url: '/auth/login' } };
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(localStorage.getItem('rentora_token')).toBe('tok');
    expect(window.location.href).toBe('http://localhost/login');
  });

  it('clears an expired session elsewhere in the app and sends the person to /login', async () => {
    setLocation('/dashboard');
    const err = { response: { status: 401 }, config: { url: '/tenants' } };
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(localStorage.getItem('rentora_token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('never navigates when already on an auth page, so it cannot loop', async () => {
    setLocation('/signup');
    const err = { response: { status: 401 }, config: { url: '/properties' } };
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(localStorage.getItem('rentora_token')).toBeNull();
    expect(window.location.href).toBe('http://localhost/signup');
  });

  it('leaves non-401 errors alone', async () => {
    setLocation('/dashboard');
    const err = { response: { status: 500 }, config: { url: '/tenants' } };
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(localStorage.getItem('rentora_token')).toBe('tok');
    expect(window.location.href).toBe('http://localhost/dashboard');
  });
});
