import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import NoticesPage from '../NoticesPage';

vi.mock('../../services/noticeService', () => ({
  getNotices: vi.fn(),
  createNotice: vi.fn(),
  updateNotice: vi.fn(),
}));
vi.mock('../../services/tenantService', () => ({ getTenants: vi.fn() }));
vi.mock('../../services/paymentService', () => ({ getPayments: vi.fn() }));
vi.mock('../../services/agentService', () => ({ getEscalations: vi.fn() }));
vi.mock('../../services/profileService', () => ({ getMessagingConfig: vi.fn() }));

const { getNotices } = await import('../../services/noticeService');
const { getTenants } = await import('../../services/tenantService');
const { getPayments } = await import('../../services/paymentService');
const { getEscalations } = await import('../../services/agentService');
const { getMessagingConfig } = await import('../../services/profileService');

const TENANT = {
  id: 't1',
  firstName: 'Sophia',
  lastName: 'Chen',
  leases: [{ id: 'l1', monthlyRent: 1700, startDate: '2025-08-01', endDate: '2026-08-01', unit: { id: 'u1', name: 'Apt 3C', property: { name: 'Maple Court Apartments' } } }],
};

const NOTICES = [
  { id: 'n1', title: 'Late rent notice — Sophia Chen', body: 'Dear Sophia…', status: 'DRAFT', createdAt: '2026-07-20T10:00:00Z', sentAt: null, tenant: TENANT, lease: { unit: { name: 'Apt 3C' } } },
  { id: 'n2', title: 'Lease renewal notice — Sophia Chen', body: 'Dear Sophia…', status: 'SENT', createdAt: '2026-07-01T10:00:00Z', sentAt: '2026-07-02T10:00:00Z', tenant: TENANT, lease: { unit: { name: 'Apt 3C' } } },
];

beforeEach(() => {
  vi.clearAllMocks();
  getNotices.mockResolvedValue({ notices: NOTICES });
  getTenants.mockResolvedValue({ tenants: [TENANT] });
  getPayments.mockResolvedValue({
    payments: [{ id: 'p1', status: 'OVERDUE', amount: 1700, dueDate: '2026-07-01', tenant: TENANT, lease: { unit: { name: 'Apt 3C' } } }],
  });
  getEscalations.mockResolvedValue([]);
  getMessagingConfig.mockResolvedValue({ messagingNumber: null, provider: null });
});

const renderPage = async () => {
  const r = renderWithRouter(<NoticesPage />);
  await screen.findByText('Late rent notice — Sophia Chen');
  return r;
};

describe('NoticesPage', () => {
  it('uses "Create draft" rather than "Generate Notice"', async () => {
    await renderPage();
    expect(screen.getAllByRole('button', { name: /Create draft/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Generate Notice/i })).not.toBeInTheDocument();
  });

  it('never says a notice was sent or delivered by Farik', async () => {
    await renderPage();
    const text = document.body.textContent;
    expect(text).not.toMatch(/delivered/i);
    expect(text).toMatch(/Recorded as sent/);
    expect(text).toMatch(/Farik does not transmit it for you/i);
  });

  it('states that notices need review and that Farik gives no legal advice', async () => {
    await renderPage();
    expect(screen.getAllByText(/Farik does not provide legal advice/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Review the notice before sending/i).length).toBeGreaterThan(0);
  });

  it('offers approval only on drafts, not on recorded notices', async () => {
    await renderPage();
    const approve = screen.getAllByRole('button', { name: /Review and approve/i });
    expect(approve).toHaveLength(1); // only the DRAFT row
  });

  it('surfaces overdue tenants with a Create draft shortcut', async () => {
    await renderPage();
    expect(await screen.findByText(/1 tenant with overdue rent/i)).toBeInTheDocument();
    expect(screen.getByText(/\$1,700 overdue/)).toBeInTheDocument();
  });

  it('shows Farik-prepared drafts as awaiting approval and links to Autopilot', async () => {
    getEscalations.mockResolvedValue([
      {
        id: 'log-1',
        summary: 'Late rent notice prepared',
        createdAt: '2026-07-25T10:00:00Z',
        draftContent: JSON.stringify({ type: 'notice', title: 'Late rent notice — Liam Nguyen', body: 'Dear Liam…' }),
      },
    ]);
    await renderPage();
    expect(await screen.findByText('Late rent notice — Liam Nguyen')).toBeInTheDocument();
    expect(screen.getByText('Awaiting your approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review in Autopilot/i })).toHaveAttribute('href', '/autopilot?tab=approvals');
  });

  it('reports the portal as the only delivery method when no number is configured', async () => {
    await renderPage();
    await waitFor(() =>
      expect(getMessagingConfig).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(/\+1\d{10}/);
  });
});
