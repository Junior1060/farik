import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../LoginPage';

const { mockLogin } = vi.hoisted(() => ({ mockLogin: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>dashboard destination</p>} />
        <Route path="/tenant" element={<p>tenant destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockLogin.mockReset();
});

describe('LoginPage', () => {
  it('is a plain email + password form with a link to signup', () => {
    renderLogin();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
    expect(document.body.textContent).not.toMatch(/pilot|waitlist|request access|apply|demo/i);
  });

  it('sends a landlord to the dashboard and a tenant to the portal', async () => {
    mockLogin.mockResolvedValue({ role: 'LANDLORD' });
    renderLogin();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: ' demo@farik.ca ' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('dashboard destination')).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledWith('demo@farik.ca', 'password123');
  });

  it('shows a friendly message on bad credentials and keeps the form usable', async () => {
    mockLogin.mockRejectedValue({ response: { status: 401, data: { error: 'Invalid email or password' } } });
    renderLogin();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'demo@farik.ca' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows a loading label while the request is open', async () => {
    let resolve;
    mockLogin.mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'demo@farik.ca' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled();
    resolve({ role: 'TENANT' });
    expect(await screen.findByText('tenant destination')).toBeInTheDocument();
  });
});
