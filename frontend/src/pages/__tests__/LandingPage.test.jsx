import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import LandingPage from '../LandingPage';

const GATED_LANGUAGE = /pilot|waitlist|wait list|request access|early access|apply|book a demo|invite[- ]only|founding landlord/i;

describe('LandingPage', () => {
  it('leads with the product headline and a one-line description', () => {
    renderWithRouter(<LandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Property management without the busywork.');
    expect(screen.getByText(/manage tenants, leases, rent, maintenance, notices, and communication from one place/i)).toBeInTheDocument();
    expect(screen.getByText('Built for independent landlords and small property managers.')).toBeInTheDocument();
  });

  it('sends every primary call to action straight to landlord signup', () => {
    renderWithRouter(<LandingPage />);
    const ctas = screen.getAllByRole('link', { name: /get started/i });
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/signup');
    for (const login of screen.getAllByRole('link', { name: /^log in$/i })) expect(login).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /see how it works/i })).toHaveAttribute('href', '#how-it-works');
  });

  it('keeps the hero free of forms and the page free of any form at all', () => {
    const { container } = renderWithRouter(<LandingPage />);
    expect(container.querySelector('form')).toBeNull();
  });

  it('contains no gated-onboarding language anywhere', () => {
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

  it('renders the required sections', () => {
    const { container } = renderWithRouter(<LandingPage />);
    for (const id of ['features', 'how-it-works', 'who-its-for', 'get-started']) {
      expect(container.querySelector(`#${id}`), `missing #${id}`).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: /built for landlords who don’t need enterprise software/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your rentals. One place.' })).toBeInTheDocument();
  });

  it('describes the product preview for assistive tech and hides its fake numbers', () => {
    const { container } = renderWithRouter(<LandingPage />);
    expect(screen.getByText(/illustration of the farik dashboard/i)).toBeInTheDocument();
    expect(container.querySelector('figure [aria-hidden="true"]')).toBeTruthy();
  });

  it('has a labelled mobile menu that toggles', () => {
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

  it('does not advertise pricing that has not been set', () => {
    renderWithRouter(<LandingPage />);
    expect(document.body.textContent).not.toMatch(/\$\d+\s*\/\s*(mo|month)|per month|free trial|free for \d+ days/i);
  });
});
