import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ImportWizard from '../ImportWizard';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    aiImport: vi.fn(),
    uploadSpreadsheet: vi.fn(),
    previewRows: vi.fn(),
    uploadDocuments: vi.fn(),
    confirmImport: vi.fn(),
    downloadTemplate: vi.fn(),
  },
}));
vi.mock('../../../services/importService', () => mocks);

const ROW = {
  _id: 'row-0',
  propertyName: 'Elm House', propertyAddress: '45 Elm St', unitNumber: 'Main',
  tenantFirstName: 'Bob', tenantLastName: 'Stone', tenantEmail: 'bob@example.com',
  leaseStartDate: '2026-10-01', leaseEndDate: '2027-09-30', monthlyRent: '1200', paymentDueDay: '1',
};

async function walkToSuccess() {
  // Step 1 → paste text → AI reads it.
  fireEvent.click(screen.getByRole('button', { name: /paste your data as text instead/i }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Elm House, Bob Stone, $1200' } });
  fireEvent.click(screen.getByRole('button', { name: /read my data/i }));
  await screen.findByRole('heading', { name: 'Review & Fix Errors' });
  // Step 2 → 3 → 4 → confirm.
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  await screen.findByRole('heading', { name: 'Lease Documents' });
  fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
  await screen.findByRole('heading', { name: 'Confirm Import' });
  fireEvent.click(screen.getByRole('button', { name: /^import 1 row$/i }));
  await screen.findByRole('heading', { name: 'Import complete!' });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.aiImport.mockResolvedValue({ rows: [ROW], summary: '1 property, 1 tenant', warnings: [] });
  mocks.previewRows.mockImplementation(async (rows) => ({ rows: rows.map((r) => ({ ...r, _serverWarnings: [] })) }));
  mocks.confirmImport.mockResolvedValue({ results: { properties: 1, units: 1, tenants: 1, leases: 1, payments: 1, skipped: 0, errors: [] } });
});

describe('ImportWizard', () => {
  it('walks upload → review → documents → confirm → done', async () => {
    render(<MemoryRouter><ImportWizard /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Upload Your Data' })).toBeInTheDocument();
    await walkToSuccess();
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Your properties and tenants are now in Farik/)).toBeInTheDocument();
  });

  it('"Import more properties" resets wizard state in React instead of reloading the browser', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...window.location, reload, pathname: '/import' } });

    render(<MemoryRouter><ImportWizard /></MemoryRouter>);
    await walkToSuccess();
    fireEvent.click(screen.getByRole('button', { name: /import more properties/i }));

    expect(await screen.findByRole('heading', { name: 'Upload Your Data' })).toBeInTheDocument();
    expect(screen.queryByText(/Import complete/)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    // Fresh state: the previous rows are gone, so going through again calls the AI once more.
    expect(mocks.aiImport).toHaveBeenCalledTimes(1);
  });

  it('offers a template-spreadsheet path that does not depend on the AI service', async () => {
    mocks.uploadSpreadsheet.mockResolvedValue({ rows: [ROW], count: 1 });
    const { container } = render(<MemoryRouter><ImportWizard /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /download the spreadsheet template/i })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]');
    const file = new File(['Property Name,Unit Number\nElm House,Main'], 'rent-roll.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole('button', { name: /read it as a template spreadsheet instead/i }));
    await screen.findByRole('heading', { name: 'Review & Fix Errors' });
    expect(mocks.uploadSpreadsheet).toHaveBeenCalledTimes(1);
    expect(mocks.aiImport).not.toHaveBeenCalled();
  });

  it('shows the AI failure as a message and keeps the page usable', async () => {
    mocks.aiImport.mockRejectedValue({ response: { status: 502, data: { error: 'The AI import service is temporarily unavailable. Please try again in a bit, or use the spreadsheet template instead.' } } });
    render(<MemoryRouter><ImportWizard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /paste your data as text instead/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'anything' } });
    fireEvent.click(screen.getByRole('button', { name: /read my data/i }));

    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /read my data/i })).toBeEnabled();
  });
});
