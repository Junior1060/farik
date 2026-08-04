import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import renderWithRouter from '../../test/renderWithRouter';
import LandingPage from '../LandingPage';

describe('LandingPage', () => {
  it('leads with the SMS-first, 1–20 unit positioning', () => {
    renderWithRouter(<LandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('The AI property manager for landlords with 1–20 units.');
    expect(h1).toHaveTextContent('Your tenants text. Farik handles the routine work.');
  });

  it('offers the pilot and demo calls to action', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByRole('link', { name: /Apply for the free pilot/i })).toHaveAttribute('href', '#pilot');
    expect(screen.getByRole('link', { name: /Explore the demo/i })).toHaveAttribute('href', '/login');
    expect(screen.getAllByRole('link', { name: /Apply for pilot/i })[0]).toHaveAttribute('href', '#pilot');
  });

  it('every nav anchor resolves to a section that exists', () => {
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
    for (const id of ['sms-demo', 'how-it-works', 'features', 'control', 'pilot', 'security', 'faq']) {
      expect(container.querySelector(`#${id}`), `missing #${id}`).toBeTruthy();
    }
  });

  it('marks the SMS conversation as an example rather than a real message', () => {
    renderWithRouter(<LandingPage />);
    const figure = screen.getByLabelText(/Example conversation/i);
    expect(figure).toHaveTextContent('My kitchen sink is leaking.');
    expect(figure).toHaveTextContent(/Example/);
  });

  it('shows the founding pilot section without fake scarcity', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByRole('heading', { name: 'Founding Landlord Pilot' })).toBeInTheDocument();
    expect(screen.getByText(/Pilot spaces are limited/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/spots? left|spaces? remaining|\d+ remaining|ends in/i);
  });

  it('does not make unsupported security, delivery, or compliance claims', () => {
    renderWithRouter(<LandingPage />);
    const text = document.body.textContent;
    for (const claim of [
      /delivered/i,
      /encrypt/i,
      /SOC ?2/i,
      /ISO ?27001/i,
      /PIPEDA/i,
      /bank-level/i,
      /data residency/i,
      /guarantee/i,
      /comply with .*tenancy/i,
    ]) {
      expect(text, `unsupported claim matched ${claim}`).not.toMatch(claim);
    }
  });

  it('states that Farik does not provide legal advice', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/not a substitute for legal advice/i)).toBeInTheDocument();
  });

  it('renders the pilot form disabled when no contact address is configured', () => {
    renderWithRouter(<LandingPage />);
    // VITE_PILOT_CONTACT_EMAIL is unset under test.
    expect(screen.getByLabelText('Your name')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Apply for the pilot/i })).toBeDisabled();
  });
});
