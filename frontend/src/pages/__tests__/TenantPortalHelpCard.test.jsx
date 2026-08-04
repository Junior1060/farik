import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import TenantPortalPage from '../TenantPortalPage';

vi.mock('../../services/profileService', () => ({
  getMessagingConfig: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
vi.mock('../../services/paymentService', () => ({ getMyPayments: vi.fn() }));
vi.mock('../../services/noticeService', () => ({ getNotices: vi.fn() }));
vi.mock('../../services/maintenanceService', () => ({
  getMaintenanceRequests: vi.fn(),
  createMaintenanceRequest: vi.fn(),
}));
vi.mock('../../services/messageService', () => ({
  getConversations: vi.fn(),
  getThread: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('../../services/stripeService', () => ({ createCheckoutSession: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'alice.morgan@email.com', role: 'TENANT', profile: { id: 't1', firstName: 'Alice', lastName: 'Morgan' } },
    logout: vi.fn(),
  }),
}));

const { getMessagingConfig } = await import('../../services/profileService');
const { getMyPayments } = await import('../../services/paymentService');
const { getNotices } = await import('../../services/noticeService');
const { getMaintenanceRequests } = await import('../../services/maintenanceService');
const { getConversations } = await import('../../services/messageService');

const LEASE = {
  id: 'l1',
  monthlyRent: 1200,
  startDate: '2025-12-01',
  endDate: '2026-12-01',
  status: 'ACTIVE',
  unit: { id: 'u1', name: 'Apt 1A', property: { name: 'Maple Court Apartments' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  getMyPayments.mockResolvedValue({
    // local noon, so the formatted date is Jul 1 regardless of the runner's timezone
    payments: [{ id: 'p1', amount: 1200, dueDate: '2026-07-01T12:00:00', status: 'OVERDUE', lease: LEASE }],
  });
  getNotices.mockResolvedValue({ notices: [] });
  getMaintenanceRequests.mockResolvedValue({ requests: [] });
  getConversations.mockResolvedValue({ conversations: [] });
});

describe('Tenant portal — Need help card', () => {
  it('never renders a phone number when messaging is not configured', async () => {
    getMessagingConfig.mockResolvedValue({ messagingNumber: null, provider: null });
    const { container } = renderWithRouter(<TenantPortalPage />);

    expect(await screen.findByText('Need help?')).toBeInTheDocument();
    await waitFor(() => expect(getMessagingConfig).toHaveBeenCalled());

    expect(screen.getByText(/Messaging number not configured/i)).toBeInTheDocument();
    expect(container.querySelector('a[href^="sms:"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Text Farik' })).toBeDisabled();
  });

  it('renders the configured number as a text link', async () => {
    getMessagingConfig.mockResolvedValue({ messagingNumber: '+13065550100', provider: 'twilio' });
    const { container } = renderWithRouter(<TenantPortalPage />);

    const link = await screen.findByRole('link', { name: /Text Farik — \+13065550100/ });
    expect(link).toHaveAttribute('href', 'sms:+13065550100');
    expect(container.querySelector('a[href="sms:+13065550100"]')).toBeTruthy();
    expect(screen.queryByText(/Messaging number not configured/i)).not.toBeInTheDocument();
  });

  it('explains texting is the main channel and the portal is for records', async () => {
    getMessagingConfig.mockResolvedValue({ messagingNumber: null, provider: null });
    renderWithRouter(<TenantPortalPage />);
    expect(
      await screen.findByText(/Text Farik for maintenance requests, rent questions, and property updates/i),
    ).toBeInTheDocument();
  });
});

describe('Tenant portal — overdue rent alert', () => {
  beforeEach(() => getMessagingConfig.mockResolvedValue({ messagingNumber: null, provider: null }));

  it('shows the amount, original due date, and status in words', async () => {
    renderWithRouter(<TenantPortalPage />);
    expect(await screen.findByText('Rent overdue')).toBeInTheDocument();
    expect(screen.getByText('Originally due')).toBeInTheDocument();
    expect(screen.getByText('Jul 1, 2026')).toBeInTheDocument();
    // status is spelled out, not conveyed by colour alone
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(1);
  });

  it('offers both Pay now and a way to reach the landlord', async () => {
    renderWithRouter(<TenantPortalPage />);
    expect(await screen.findByRole('button', { name: 'Pay now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact landlord' })).toBeInTheDocument();
  });
});

describe('Tenant portal — tabs', () => {
  beforeEach(() => getMessagingConfig.mockResolvedValue({ messagingNumber: null, provider: null }));

  it('keeps every portal section reachable as an accessible tab', async () => {
    renderWithRouter(<TenantPortalPage />);
    await screen.findByText('Need help?');
    const tablist = screen.getByRole('tablist', { name: 'Tenant portal sections' });
    for (const label of ['Overview', 'Payments', 'Maintenance', 'Messages', 'Notices', 'Profile']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(tablist).toBeInTheDocument();
  });
});
