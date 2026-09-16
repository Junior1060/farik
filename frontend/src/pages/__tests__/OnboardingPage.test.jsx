import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OnboardingPage from '../OnboardingPage';

const { mockCreateProperty, mockCreateTenant, mockCreateLease } = vi.hoisted(() => ({
  mockCreateProperty: vi.fn(),
  mockCreateTenant: vi.fn(),
  mockCreateLease: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'LANDLORD', profile: { firstName: 'Jordan' } } }),
}));
vi.mock('../../services/propertyService', () => ({ createProperty: mockCreateProperty }));
vi.mock('../../services/tenantService', () => ({ createTenant: mockCreateTenant }));
vi.mock('../../services/leaseService', () => ({ createLease: mockCreateLease }));
// The real wizard is exercised by the Import page; here it only needs to mount.
vi.mock('../../components/import/ImportWizard', () => ({ default: () => <div>import wizard mounted</div> }));

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/dashboard" element={<p>dashboard destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const PROPERTY = {
  id: 'prop-1',
  name: 'Maple Court',
  units: [
    { id: 'u1', name: 'Unit 1', rentAmount: 0, isOccupied: false },
    { id: 'u2', name: 'Unit 2', rentAmount: 0, isOccupied: false },
  ],
};

async function goToPropertyStep() {
  fireEvent.click(screen.getByRole('button', { name: /set up manually/i }));
  await screen.findByRole('heading', { name: 'Add your first property' });
}

function fillProperty() {
  fireEvent.change(screen.getByLabelText('Property name'), { target: { value: 'Maple Court' } });
  fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '12 Maple St' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Regina' } });
  fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'SK' } });
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: 'S4S 4H4' } });
  fireEvent.change(screen.getByLabelText('Property type'), { target: { value: 'MULTI_FAMILY' } });
  fireEvent.change(screen.getByLabelText('Number of units'), { target: { value: '2' } });
}

beforeEach(() => {
  mockCreateProperty.mockReset();
  mockCreateTenant.mockReset();
  mockCreateLease.mockReset();
  window.scrollTo = vi.fn();
});

describe('OnboardingPage', () => {
  it('welcomes the landlord and offers import, manual setup, and skip', () => {
    renderOnboarding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Farik');
    expect(screen.getByText(/get your rentals into Farik/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import my property data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up manually/i })).toBeInTheDocument();
    const skips = screen.getAllByRole('link', { name: /skip for now/i });
    expect(skips.length).toBeGreaterThan(0);
    for (const s of skips) expect(s).toHaveAttribute('href', '/dashboard');
  });

  it('routes the import choice into the existing import wizard', async () => {
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /import my property data/i }));
    expect(await screen.findByRole('heading', { name: 'Upload your existing property files' })).toBeInTheDocument();
    expect(screen.getByText('import wizard mounted')).toBeInTheDocument();
  });

  it('asks only for the essentials of a first property and validates them', async () => {
    renderOnboarding();
    await goToPropertyStep();
    for (const [label, id] of [['Property name', 'property-name'], ['Property type', 'property-type'], ['Number of units', 'property-unitCount']]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('id', id);
    }
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(await screen.findByText('Enter the property name.')).toBeInTheDocument();
    expect(screen.getByText('Choose a property type.')).toBeInTheDocument();
    expect(mockCreateProperty).not.toHaveBeenCalled();
  });

  it('creates the property with an enum type and a unit count, then moves on to tenants', async () => {
    mockCreateProperty.mockResolvedValue({ property: PROPERTY });
    renderOnboarding();
    await goToPropertyStep();
    fillProperty();
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByRole('heading', { name: 'Add tenants' })).toBeInTheDocument();
    expect(mockCreateProperty).toHaveBeenCalledWith({
      name: 'Maple Court', address: '12 Maple St', city: 'Regina', state: 'SK', zip: 'S4S 4H4',
      propertyType: 'MULTI_FAMILY', unitCount: 2,
    });
    expect(screen.getAllByText('Maple Court').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /skip for now/i })[0]).toHaveAttribute('href', '/dashboard');
  });

  it('adds a tenant with their lease and offers the dashboard afterwards', async () => {
    mockCreateProperty.mockResolvedValue({ property: PROPERTY });
    mockCreateTenant.mockResolvedValue({
      tenant: { id: 'tp-1', firstName: 'Alice', lastName: 'Morgan' },
      lease: { id: 'l1', unitId: 'u1', monthlyRent: 1450, unit: { name: 'Unit 1' } },
    });
    renderOnboarding();
    await goToPropertyStep();
    fillProperty();
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await screen.findByRole('heading', { name: 'Add tenants' });

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Monthly rent ($)'), { target: { value: '1450' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tenant' }));

    expect(await screen.findByRole('heading', { name: 'Tenant added' })).toBeInTheDocument();
    await waitFor(() => expect(mockCreateTenant).toHaveBeenCalledWith(expect.objectContaining({
      firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com', unitId: 'u1', monthlyRent: 1450, deposit: 0,
    })));
    expect(mockCreateLease).not.toHaveBeenCalled();
    expect(screen.getByText(/Alice Morgan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another tenant/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(await screen.findByText('dashboard destination')).toBeInTheDocument();
  });

  it('surfaces a property save failure without leaving the form', async () => {
    mockCreateProperty.mockRejectedValue({ response: { status: 500, data: { error: 'boom' } } });
    renderOnboarding();
    await goToPropertyStep();
    fillProperty();
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeEnabled();
  });
});
