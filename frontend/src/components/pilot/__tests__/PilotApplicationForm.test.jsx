import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import renderWithRouter from '../../../test/renderWithRouter';
import PilotApplicationForm from '../PilotApplicationForm';

vi.mock('../../../services/pilotService', () => ({
  submitPilotApplication: vi.fn(),
  getPilotConfig: vi.fn(),
}));

const { submitPilotApplication, getPilotConfig } = await import('../../../services/pilotService');

const APPLICATION = {
  id: 'app-1',
  fullName: 'Jordan Blake',
  firstName: 'Jordan',
  email: 'jordan@example.com',
  createdAt: '2026-08-04T12:00:00Z',
};

const fill = (overrides = {}) => {
  const values = {
    'Full name': 'Jordan Blake',
    'Email address': 'jordan@example.com',
    'Phone number': '(306) 555-0100',
    City: 'Saskatoon',
    'Units you manage': '6',
    'What currently takes the most time?': 'Chasing rent every month and after-hours texts.',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value === null) continue;
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)), {
      target: { value },
    });
  }
  fireEvent.change(screen.getByLabelText(/^Preferred contact method/), { target: { value: 'EMAIL' } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /Apply for the pilot/i }));

beforeEach(() => {
  vi.clearAllMocks();
  getPilotConfig.mockResolvedValue({ bookingUrl: null });
  submitPilotApplication.mockResolvedValue({ ok: true, application: APPLICATION, bookingUrl: null });
});

describe('PilotApplicationForm — it is functional', () => {
  it('has no disabled inputs and a live submit button', () => {
    renderWithRouter(<PilotApplicationForm />);
    for (const field of screen.getAllByRole('textbox')) expect(field).toBeEnabled();
    expect(screen.getByRole('combobox', { name: /Preferred contact method/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Apply for the pilot/i })).toBeEnabled();
  });

  it('never shows a configuration message to the applicant', () => {
    renderWithRouter(<PilotApplicationForm />);
    const text = document.body.textContent;
    expect(text).not.toMatch(/has not been configured/i);
    expect(text).not.toMatch(/read-only/i);
    expect(text).not.toMatch(/BOOKING_URL|RESEND|SMTP|API key/i);
  });

  it('uses the right input types for mobile keyboards', () => {
    renderWithRouter(<PilotApplicationForm />);
    expect(screen.getByLabelText(/^Email address/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^Phone number/)).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText(/^Units you manage/)).toHaveAttribute('type', 'number');
  });

  it('carries the consent line and links to Privacy and Terms', () => {
    renderWithRouter(<PilotApplicationForm />);
    expect(screen.getByText(/Farik may contact you about the pilot. No payment is required/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});

describe('PilotApplicationForm — validation', () => {
  it('blocks submission and names every missing required field', async () => {
    renderWithRouter(<PilotApplicationForm />);
    submit();

    expect(await screen.findByText('Please enter your full name.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Please enter a phone number.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your city.')).toBeInTheDocument();
    expect(screen.getByText('Enter the number of units you manage.')).toBeInTheDocument();
    expect(screen.getByText('Choose how you would like us to reach you.')).toBeInTheDocument();
    expect(submitPilotApplication).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill({ 'Email address': 'jordan@' });
    submit();
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(submitPilotApplication).not.toHaveBeenCalled();
  });

  it.each([['0'], ['-3'], ['2.5']])('rejects a unit count of %s', async (units) => {
    renderWithRouter(<PilotApplicationForm />);
    fill({ 'Units you manage': units });
    submit();
    await waitFor(() => expect(submitPilotApplication).not.toHaveBeenCalled());
    expect(screen.getByLabelText(/^Units you manage/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('requires a real sentence for the main problem', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill({ 'What currently takes the most time?': 'rent' });
    submit();
    expect(await screen.findByText(/at least a sentence/i)).toBeInTheDocument();
  });

  it('preserves everything the applicant typed when validation fails', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill({ 'Email address': 'bad' });
    submit();
    await screen.findByText('Please enter a valid email address.');

    expect(screen.getByLabelText(/^Full name/)).toHaveValue('Jordan Blake');
    expect(screen.getByLabelText(/^Phone number/)).toHaveValue('(306) 555-0100');
    expect(screen.getByLabelText(/^City/)).toHaveValue('Saskatoon');
    expect(screen.getByLabelText(/^Units you manage/)).toHaveValue(6);
  });

  it('clears a field error as soon as the applicant corrects it', async () => {
    renderWithRouter(<PilotApplicationForm />);
    submit();
    await screen.findByText('Please enter your full name.');

    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Jordan Blake' } });
    expect(screen.queryByText('Please enter your full name.')).not.toBeInTheDocument();
  });

  it('surfaces server-side field errors inline', async () => {
    submitPilotApplication.mockRejectedValue({
      response: { status: 400, data: { fieldErrors: { email: 'That email address looks wrong.' } } },
    });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    expect(await screen.findByText('That email address looks wrong.')).toBeInTheDocument();
  });
});

describe('PilotApplicationForm — submission', () => {
  it('sends trimmed values with a numeric unit count and a source', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    await waitFor(() => expect(submitPilotApplication).toHaveBeenCalledTimes(1));
    const payload = submitPilotApplication.mock.calls[0][0];
    expect(payload.unitsManaged).toBe(6);
    expect(payload.preferredContactMethod).toBe('EMAIL');
    expect(payload.source).toBe('landing_pilot_section');
  });

  it('shows a loading label while the request is in flight', async () => {
    let resolve;
    submitPilotApplication.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    const button = await screen.findByRole('button', { name: /Submitting application/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    resolve({ ok: true, application: APPLICATION, bookingUrl: null });
    await screen.findByText('Application received');
  });

  it('does not submit twice when the button is double-clicked', async () => {
    let resolve;
    submitPilotApplication.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderWithRouter(<PilotApplicationForm />);
    fill();
    const button = screen.getByRole('button', { name: /Apply for the pilot/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(submitPilotApplication).toHaveBeenCalledTimes(1));
    resolve({ ok: true, application: APPLICATION, bookingUrl: null });
    await screen.findByText('Application received');
  });

  it('replaces the form with the success panel so it cannot be resubmitted', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    await screen.findByText('Application received');
    expect(screen.queryByRole('button', { name: /Apply for the pilot/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Full name/)).not.toBeInTheDocument();
  });

  it('includes a honeypot field that is hidden from assistive technology', () => {
    const { container } = renderWithRouter(<PilotApplicationForm />);
    const honeypot = container.querySelector('input[autocomplete="off"][tabindex="-1"]');
    expect(honeypot).toBeTruthy();
    expect(honeypot.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /website/i })).not.toBeInTheDocument();
  });
});

describe('PilotApplicationForm — errors', () => {
  it('offers a retryable error without exposing internals', async () => {
    submitPilotApplication.mockRejectedValue({
      response: { status: 500, data: { error: 'P1001 cannot reach db.supabase.co:5432' } },
    });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    expect(await screen.findByText(/We could not submit your application/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/supabase|5432|P1001/i);
    // the form is still there, still filled, still submittable
    expect(screen.getByRole('button', { name: /Apply for the pilot/i })).toBeEnabled();
    expect(screen.getByLabelText(/^Full name/)).toHaveValue('Jordan Blake');
  });

  it('explains a rate-limited submission in plain language', async () => {
    submitPilotApplication.mockRejectedValue({ response: { status: 429, data: {} } });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    expect(await screen.findByText(/received several applications from your network/i)).toBeInTheDocument();
  });

  it('lets the applicant retry after a failure', async () => {
    submitPilotApplication.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();
    await screen.findByText(/We could not submit your application/i);

    submitPilotApplication.mockResolvedValue({ ok: true, application: APPLICATION, bookingUrl: null });
    submit();
    expect(await screen.findByText('Application received')).toBeInTheDocument();
  });
});

describe('PilotApplicationForm — booking', () => {
  it('offers a prefilled booking CTA when a scheduling link is configured', async () => {
    const bookingUrl = 'https://cal.com/farik/15min?name=Jordan+Blake&email=jordan%40example.com&pilot_ref=app-1';
    submitPilotApplication.mockResolvedValue({ ok: true, application: APPLICATION, bookingUrl });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    const cta = await screen.findByRole('link', { name: /Book a 15-minute call/i });
    expect(cta).toHaveAttribute('href', bookingUrl);
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/We also sent the booking link to jordan@example.com/i)).toBeInTheDocument();
  });

  it('greets the applicant by first name', async () => {
    submitPilotApplication.mockResolvedValue({ ok: true, application: APPLICATION, bookingUrl: 'https://cal.com/farik/15min' });
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();
    expect(await screen.findByText(/Thanks, Jordan\./)).toBeInTheDocument();
  });

  it('falls back to a follow-up promise when no scheduling link is configured', async () => {
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();

    expect(await screen.findByText('Application received')).toBeInTheDocument();
    expect(screen.getByText(/contact you within one business day/i)).toBeInTheDocument();
    // no broken or empty booking affordance
    expect(screen.queryByRole('link', { name: /Book a 15-minute call/i })).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('still succeeds when the booking config lookup itself fails', async () => {
    getPilotConfig.mockRejectedValue(new Error('network'));
    renderWithRouter(<PilotApplicationForm />);
    fill();
    submit();
    expect(await screen.findByText('Application received')).toBeInTheDocument();
  });
});

describe('PilotApplicationForm — mobile', () => {
  it('uses at least 16px input text so iOS Safari does not auto-zoom', () => {
    renderWithRouter(<PilotApplicationForm />);
    // .input resolves to `text-base sm:text-sm` — 16px on mobile, 14px from sm up.
    expect(screen.getByLabelText(/^Full name/).className).toMatch(/\binput\b/);
  });

  it('makes the submit button and the booking CTA full width', async () => {
    submitPilotApplication.mockResolvedValue({ ok: true, application: APPLICATION, bookingUrl: 'https://cal.com/farik/15min' });
    renderWithRouter(<PilotApplicationForm />);
    expect(screen.getByRole('button', { name: /Apply for the pilot/i }).className).toMatch(/w-full/);

    fill();
    submit();
    const cta = await screen.findByRole('link', { name: /Book a 15-minute call/i });
    expect(cta.className).toMatch(/w-full/);
  });
});
