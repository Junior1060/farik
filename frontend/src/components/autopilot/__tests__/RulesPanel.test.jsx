import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import renderWithRouter from '../../../test/renderWithRouter';
import RulesPanel from '../RulesPanel';
import { RULES, ENFORCED_RULES, STORED_ONLY_RULES, coerceRuleValue } from '../ruleMap';
import { updateOrgPolicy } from '../../../services/policyApi';
import { updateAgentConfig } from '../../../services/agentService';

vi.mock('../../../services/policyApi', () => ({
  getOrgPolicies: vi.fn(),
  updateOrgPolicy: vi.fn(() => Promise.resolve({})),
  getPropertyPolicies: vi.fn(() => Promise.resolve({})),
  updatePropertyPolicy: vi.fn(() => Promise.resolve({})),
  deletePropertyPolicy: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../../services/agentService', () => ({
  getAgentConfig: vi.fn(),
  updateAgentConfig: vi.fn((d) => Promise.resolve({ isEnabled: true, ...d })),
  getVendors: vi.fn(() => Promise.resolve([])),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
}));

vi.mock('../../../services/propertyService', () => ({
  getProperties: vi.fn(() => Promise.resolve({ properties: [] })),
}));

const { getOrgPolicies } = await import('../../../services/policyApi');
const { getAgentConfig } = await import('../../../services/agentService');

const POLICIES = {
  MAINTENANCE: {
    trustLevel: 'OPERATE_WITHIN_POLICY',
    settings: {
      maxAutoSpend: 500, maxVendorRetries: 2, followUpIntervalHours: 24,
      allowAutoScheduling: true, requireTenantEntryPermission: true,
    },
  },
  RENT: {
    trustLevel: 'OPERATE_WITHIN_POLICY',
    settings: { gracePeriodDays: 0, firstReminderOffsetDays: -3, landlordEscalationOffsetDays: -7 },
  },
  LEASE: { trustLevel: 'DRAFT', settings: { requireApprovalForRenewalOffer: true } },
  COMMUNICATION: {
    trustLevel: 'DRAFT',
    settings: { smsEnabled: false, quietHoursStart: '21:00', quietHoursEnd: '08:00' },
  },
};

const CONFIG = {
  isEnabled: true, autoRentReminders: true, autoMaintenance: true,
  autoMessages: true, autoLeaseRenewal: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getOrgPolicies.mockResolvedValue(structuredClone(POLICIES));
  getAgentConfig.mockResolvedValue({ ...CONFIG });
});

const renderPanel = async (props = {}) => {
  const result = renderWithRouter(<RulesPanel {...props} />);
  await screen.findByText('Active rules');
  return result;
};

describe('ruleMap', () => {
  it('every rule points at a real storage target', () => {
    for (const rule of RULES) {
      expect(rule.key, `${rule.id} has no key`).toBeTruthy();
      expect(['policy', 'agentConfig']).toContain(rule.target);
      if (rule.target === 'policy') {
        expect(['MAINTENANCE', 'RENT', 'LEASE', 'COMMUNICATION']).toContain(rule.domain);
      }
      if (rule.control === 'select') expect(rule.options?.length).toBeGreaterThan(0);
    }
  });

  it('rule ids are unique', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it('does not surface the dead AgentConfig toggles', () => {
    const keys = RULES.filter((r) => r.target === 'agentConfig').map((r) => r.key);
    expect(keys).not.toContain('autoMaintenance');
    expect(keys).not.toContain('autoMessages');
  });

  it('coerces numeric controls to numbers, not strings', () => {
    const threshold = RULES.find((r) => r.id === 'maxAutoSpend');
    expect(coerceRuleValue(threshold, '750')).toBe(750);
    const retries = RULES.find((r) => r.id === 'maxVendorRetries');
    expect(coerceRuleValue(retries, '3')).toBe(3);
  });
});

describe('RulesPanel', () => {
  it('separates enforced rules from stored-only preferences', async () => {
    await renderPanel();
    expect(screen.getByText('Saved preferences — not yet enforced')).toBeInTheDocument();
    expect(screen.getByText(/Farik stores these but does not act on them yet/i)).toBeInTheDocument();

    const storedSection = screen.getByLabelText('Saved preferences — not yet enforced');
    for (const rule of STORED_ONLY_RULES) {
      expect(storedSection, `${rule.id} missing`).toHaveTextContent(rule.label);
    }
    const activeSection = screen.getByLabelText('Active rules');
    for (const rule of ENFORCED_RULES) {
      expect(activeSection, `${rule.id} missing`).toHaveTextContent(rule.label);
    }
    // No enforced rule leaks into the not-yet-enforced list.
    for (const rule of ENFORCED_RULES) {
      expect(storedSection).not.toHaveTextContent(rule.label);
    }
  });

  it('saves the expense threshold to MAINTENANCE.maxAutoSpend as a number', async () => {
    await renderPanel();
    const input = screen.getByLabelText(/Book repairs without asking, up to/i);
    fireEvent.change(input, { target: { value: '750' } });
    await waitFor(() =>
      expect(updateOrgPolicy).toHaveBeenCalledWith('MAINTENANCE', { settings: { maxAutoSpend: 750 } }),
    );
  });

  it('saves a select rule to its mapped domain and key', async () => {
    await renderPanel();
    fireEvent.change(screen.getByLabelText(/Vendor follow-up attempts/i), { target: { value: '3' } });
    await waitFor(() =>
      expect(updateOrgPolicy).toHaveBeenCalledWith('MAINTENANCE', { settings: { maxVendorRetries: 3 } }),
    );
  });

  it('saves a stored-only switch to its mapped policy key', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: /Require tenant permission before entry/i }));
    await waitFor(() =>
      expect(updateOrgPolicy).toHaveBeenCalledWith('MAINTENANCE', {
        settings: { requireTenantEntryPermission: false },
      }),
    );
  });

  it('routes AgentConfig rules to updateAgentConfig, never to updateOrgPolicy', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: /Prepare and send rent reminders automatically/i }));
    await waitFor(() => expect(updateAgentConfig).toHaveBeenCalledWith({ autoRentReminders: false }));
    expect(updateOrgPolicy).not.toHaveBeenCalled();
  });

  it('flags the SMS rule when no messaging number is configured', async () => {
    await renderPanel({ messagingConfigured: false });
    expect(screen.getByText(/Messaging number not configured/i)).toBeInTheDocument();
  });

  it('shows the safety rules that no setting can weaken', async () => {
    await renderPanel();
    expect(screen.getByText(/Never issue a legal or eviction notice automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/Never apply a rent increase automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/Never pay a vendor automatically/i)).toBeInTheDocument();
  });

  it('reverts optimistically-applied changes when the save fails', async () => {
    updateOrgPolicy.mockRejectedValueOnce(new Error('boom'));
    await renderPanel();
    const input = screen.getByLabelText(/Book repairs without asking, up to/i);
    fireEvent.change(input, { target: { value: '900' } });
    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue(500));
  });
});
