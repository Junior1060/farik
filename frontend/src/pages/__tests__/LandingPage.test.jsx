import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import LandingPage from '../LandingPage';

// \bpilot\b so the product's own "Autopilot" feature does not trip the check.
const GATED_LANGUAGE = /\bpilot\b|waitlist|wait list|request access|early access|apply|book a (call|demo)|invite[- ]only|founding landlord|spaces are limited|30 days|now onboarding|personal onboarding/i;

describe('LandingPage', () => {
  it('leads with the product headline and the one-line description', () => {
    renderWithRouter(<LandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Property management without the busywork.');
    expect(screen.getByText(/manage tenants, leases, rent, maintenance, notices, and communication from one place/i)).toBeInTheDocument();
    expect(screen.getByText(/The AI property manager for independent landlords/i)).toBeInTheDocument();
  });

  it('renders Get Started and sends every instance straight to /signup, never an anchor or a form', () => {
    renderWithRouter(<LandingPage />);
    const ctas = screen.getAllByRole('link', { name: /get started/i });
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/signup');
    for (const login of screen.getAllByRole('link', { name: /^log in$/i })) expect(login).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /see how it works/i })).toHaveAttribute('href', '#how-it-works');
  });

  it('uses the required navigation', () => {
    renderWithRouter(<LandingPage />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['How it works', 'Features', 'Security', 'Log in', 'Get Started']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('does not render the pilot form or any form at all', () => {
    const { container } = renderWithRouter(<LandingPage />);
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByLabelText(/units you manage/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /submit|send/i })).toBeNull();
  });

  it('contains no pilot or gated-onboarding language', () => {
    renderWithRouter(<LandingPage />);
    expect(document.body.textContent).not.toMatch(GATED_LANGUAGE);
  });

  it('every in-page anchor resolves to a section that exists', () => {
    const { container } = renderWithRouter(<LandingPage />);
    const anchors = [...container.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h !== '#main');
    expect(anchors.length).toBeGreaterThan(0);
    for (const href of new Set(anchors)) {
      expect(container.querySelector(href), `missing section for ${href}`).toBeTruthy();
    }
  });

  it('keeps the product identity sections', () => {
    const { container } = renderWithRouter(<LandingPage />);
    for (const id of ['sms-demo', 'how-it-works', 'features', 'control', 'security', 'faq', 'get-started']) {
      expect(container.querySelector(`#${id}`), `missing #${id}`).toBeTruthy();
    }
    const figure = screen.getByLabelText(/Example conversation/i);
    expect(figure).toHaveTextContent('My kitchen sink is leaking.');
    expect(figure).toHaveTextContent(/Example/);
    expect(screen.getByText(/not a substitute for legal advice/i)).toBeInTheDocument();
  });

  it('has a labelled mobile menu that toggles and closes on Escape', () => {
    renderWithRouter(<LandingPage />);
    const toggle = screen.getByRole('button', { name: /open menu/i });
    const menu = document.getElementById('mobile-menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
    expect(menu).toHaveAttribute('hidden');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute('aria-expanded', 'true');
    expect(menu).not.toHaveAttribute('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu).toHaveAttribute('hidden');
  });

  it('does not make unsupported security, delivery, or compliance claims', () => {
    renderWithRouter(<LandingPage />);
    const text = document.body.textContent;
    for (const claim of [
      /delivered/i, /encrypt/i, /SOC ?2/i, /ISO ?27001/i, /PIPEDA/i, /bank-level/i, /data residency/i, /guarantee/i, /comply with .*tenancy/i,
    ]) {
      expect(text, `unsupported claim matched ${claim}`).not.toMatch(claim);
    }
  });

  it('never tells a visitor the deployment is misconfigured', () => {
    renderWithRouter(<LandingPage />);
    const text = document.body.textContent;
    expect(text).not.toMatch(/has not been configured/i);
    expect(text).not.toMatch(/read-only/i);
  });
});
