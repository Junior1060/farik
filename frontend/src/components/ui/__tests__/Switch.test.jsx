import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Switch from '../Switch';

describe('Switch', () => {
  it('renders as a switch with aria-checked tracking the checked prop', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} label="Send rent reminders" />);
    const el = screen.getByRole('switch', { name: 'Send rent reminders' });
    expect(el).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked onChange={() => {}} label="Send rent reminders" />);
    expect(screen.getByRole('switch', { name: 'Send rent reminders' })).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the negated value', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Quiet hours" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Quiet hours" disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('communicates state with text, not colour alone', () => {
    render(<Switch checked onChange={() => {}} label="Autopilot" />);
    expect(screen.getByRole('switch')).toHaveTextContent('On');
  });

  it('renders an optional description', () => {
    render(<Switch checked={false} onChange={() => {}} label="Quiet hours" description="No texts overnight" />);
    expect(screen.getByText('No texts overnight')).toBeInTheDocument();
  });
});
