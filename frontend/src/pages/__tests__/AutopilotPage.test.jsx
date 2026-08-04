import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import AutopilotPage from '../AutopilotPage';

vi.mock('../../services/agentService', () => ({
  getAgentConfig: vi.fn(() => Promise.resolve({ isEnabled: true, autoRentReminders: true, autoLeaseRenewal: false })),
  updateAgentConfig: vi.fn(),
  getAgentLogs: vi.fn(),
  getTimeline: vi.fn(),
  getEscalations: vi.fn(),
  approveLog: vi.fn(),
  rejectLog: vi.fn(),
  cancelScheduled: vi.fn(),
  triggerAgentRun: vi.fn(),
  getVendors: vi.fn(() => Promise.resolve([])),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
}));
vi.mock('../../services/policyApi', () => ({
  getOrgPolicies: vi.fn(() => Promise.resolve({
    MAINTENANCE: { trustLevel: 'OPERATE_WITHIN_POLICY', settings: { maxAutoSpend: 500 } },
    RENT: { trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} },
    LEASE: { trustLevel: 'DRAFT', settings: {} },
    COMMUNICATION: { trustLevel: 'DRAFT', settings: {} },
  })),
  updateOrgPolicy: vi.fn(),
  getPropertyPolicies: vi.fn(() => Promise.resolve({})),
  updatePropertyPolicy: vi.fn(),
  deletePropertyPolicy: vi.fn(),
}));
vi.mock('../../services/propertyService', () => ({ getProperties: vi.fn(() => Promise.resolve({ properties: [] })) }));
vi.mock('../../services/profileService', () => ({ getMessagingConfig: vi.fn(() => Promise.resolve({ messagingNumber: null })) }));

const autopilot = { isEnabled: true, loaded: true, escalatedCount: 2, toggle: vi.fn(), refresh: vi.fn() };
vi.mock('../../context/AutopilotContext', () => ({ useAutopilot: () => autopilot }));

const { getAgentLogs, getTimeline, getEscalations } = await import('../../services/agentService');

const LOG = {
  id: 'log-1',
  actionType: 'LATE_RENT_NOTICE',
  confidence: 'LOW',
  summary: 'Liam Nguyen has an overdue balance of $1,650. A reminder draft is ready for review.',
  status: 'ESCALATED',
  entityType: 'payment',
  entityId: 'pay-1',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  details: { tenantName: 'Liam Nguyen', unitName: 'Suite 12', propertyName: 'Sunset Ridge Complex', amount: 1650 },
  draftContent: JSON.stringify({ type: 'notice', title: 'Late rent notice — August 2026', body: 'Dear Liam…' }),
};

beforeEach(() => {
  vi.clearAllMocks();
  getAgentLogs.mockResolvedValue({ logs: [LOG], total: 1 });
  getEscalations.mockResolvedValue([LOG]);
  getTimeline.mockResolvedValue([
    {
      id: 'e1',
      actionType: 'MAINTENANCE_TRIAGE',
      summary: 'Alice Morgan reported a leaking sink. Farik categorized it as plumbing and requested a photo.',
      tenantName: 'Alice Morgan',
      unitName: 'Apt 1A',
      propertyName: 'Maple Court Apartments',
      time: '2026-08-03T09:00:00Z',
      status: 'COMPLETED',
      entityType: 'maintenance',
      entityId: 'm1',
      confidence: 'HIGH',
      cancellable: false,
    },
  ]);
});

describe('AutopilotPage', () => {
  it('presents exactly the four required tabs', async () => {
    renderWithRouter(<AutopilotPage />);
    const tablist = await screen.findByRole('tablist', { name: 'Autopilot sections' });
    const labels = [...tablist.querySelectorAll('[role="tab"]')].map((t) => t.textContent.replace(/\d+$/, '').trim());
    expect(labels).toEqual(['Activity', 'Needs approval', 'Rules', 'Performance']);
  });

  it('badges the approval tab with the outstanding count', async () => {
    renderWithRouter(<AutopilotPage />);
    expect(await screen.findByRole('tab', { name: /Needs approval/ })).toHaveTextContent('2');
  });

  it('defaults to Activity and shows what Farik did', async () => {
    renderWithRouter(<AutopilotPage />);
    expect(await screen.findByText(/Alice Morgan reported a leaking sink/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Activity/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('deep-links to the approvals tab via ?tab=approvals', async () => {
    renderWithRouter(<AutopilotPage />, { route: '/autopilot?tab=approvals' });
    expect(await screen.findByText(/Liam Nguyen has an overdue balance/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Needs approval/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers Approve and Reject, but never a working Edit', async () => {
    renderWithRouter(<AutopilotPage />, { route: '/autopilot?tab=approvals' });
    await screen.findByText(/Liam Nguyen has an overdue balance/);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeDisabled();
  });

  it('previews the prepared draft so it can be reviewed before approval', async () => {
    renderWithRouter(<AutopilotPage />, { route: '/autopilot?tab=approvals' });
    expect(await screen.findByText('Late rent notice — August 2026')).toBeInTheDocument();
    expect(screen.getByText('Dear Liam…')).toBeInTheDocument();
  });

  it('withholds the approval rate until there is enough history', async () => {
    renderWithRouter(<AutopilotPage />, { route: '/autopilot?tab=performance' });
    expect(await screen.findByText('Approval rate')).toBeInTheDocument();
    expect(screen.getByText(/Shown after 5 decisions/)).toBeInTheDocument();
    // no invented productivity claims
    expect(document.body.textContent).not.toMatch(/hours saved|money saved|% faster/i);
  });

  it('switches tabs on click', async () => {
    renderWithRouter(<AutopilotPage />);
    await screen.findByRole('tablist', { name: 'Autopilot sections' });
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    await waitFor(() => expect(screen.getByText('Active rules')).toBeInTheDocument());
  });
});
