import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SignupPage from '../SignupPage';

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister }),
}));

function renderSignup(role = 'LANDLORD') {
  return render(
    <MemoryRouter initialEntries={[role === 'TENANT' ? '/signup/tenant' : '/signup']}>
      <Routes>
        <Route path="/signup" element={<SignupPage role="LANDLORD" />} />
        <Route path="/signup/tenant" element={<SignupPage role="TENANT" />} />
        <Route path="/onboarding" element={<p>onboarding destination</p>} />
        <Route path="/tenant" element={<p>tenant portal destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillValid() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jordan Blake' } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: '  Jordan@Example.com ' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'correct horse' } });
}

// Braces matter: an arrow that returns the mock would hand Vitest a "cleanup
// function" (the mock itself) to call after each test.
beforeEach(() => {
  mockRegister.mockReset();
});

describe('SignupPage', () => {
  it('asks only for name, email, password, and an optional company name, with labelled inputs', () => {
    renderSignup();
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
    for (const [label, id] of [[/full name/i, 'signup-fullName'], [/^email$/i, 'signup-email'], [/^password$/i, 'signup-password'], [/company or property management name/i, 'signup-companyName']]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('id', id);
    }
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');

    // No questionnaire.
    for (const absent of [/units/i, /phone/i, /city/i, /contact method/i, /software/i, /notes/i, /booking/i]) {
      expect(screen.queryByLabelText(absent)).toBeNull();
    }
    expect(document.body.textContent).not.toMatch(/pilot|waitlist|request access|apply/i);
  });

  it('validates before calling the API and announces errors next to the fields', async () => {
    renderSignup();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose a password.')).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/full name/i);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'signup-fullName-error');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects a weak password and a malformed email client-side', async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jordan' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registers a landlord with a normalised email and lands them in onboarding', async () => {
    mockRegister.mockResolvedValue({ id: 'u1', role: 'LANDLORD' });
    renderSignup();
    fillValid();
    fireEvent.change(screen.getByLabelText(/company or property management name/i), { target: { value: 'Blake Rentals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('onboarding destination')).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith({
      fullName: 'Jordan Blake',
      email: 'jordan@example.com',
      password: 'correct horse',
      companyName: 'Blake Rentals',
      role: 'LANDLORD',
    });
  });

  it('shows a real loading state and blocks double submission', async () => {
    let resolve;
    mockRegister.mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderSignup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const busy = await screen.findByRole('button', { name: 'Creating account…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));

    resolve({ id: 'u1', role: 'LANDLORD' });
    expect(await screen.findByText('onboarding destination')).toBeInTheDocument();
  });

  it('explains an existing account instead of echoing the server', async () => {
    mockRegister.mockRejectedValue({ response: { status: 409, data: { error: 'Email already in use' } } });
    renderSignup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An account with this email already exists. Try logging in instead.');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it.each([
    ['a network failure', {}, /couldn’t connect to Farik|couldn't connect to Farik/i],
    ['a server failure', { response: { status: 500, data: { error: 'PrismaClientKnownRequestError: connection refused' } } }, /^Something went wrong\. Please try again\.$/],
    ['a server-side weak password', { response: { status: 400, data: { error: 'Validation error', details: [{ field: 'password', message: 'String must contain at least 8 character(s)' }] } } }, /at least 8 characters/i],
  ])('turns %s into a human message', async (_label, error, expected) => {
    mockRegister.mockRejectedValue(error);
    renderSignup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expected);
    expect(alert.textContent).not.toMatch(/Prisma|connection refused|String must/i);
  });

  it('activates a tenant account with the TENANT role and sends them to the portal', async () => {
    mockRegister.mockResolvedValue({ id: 'u2', role: 'TENANT' });
    renderSignup('TENANT');
    expect(screen.getByRole('heading', { level: 1, name: 'Activate your tenant account' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/company/i)).toBeNull();

    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('tenant portal destination')).toBeInTheDocument();
    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ role: 'TENANT', companyName: undefined })));
  });
});
