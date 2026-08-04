import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Tabs from '../Tabs';

const TABS = [
  { id: 'activity', label: 'Activity' },
  { id: 'approvals', label: 'Needs approval', count: 3 },
  { id: 'rules', label: 'Rules' },
];

function Harness({ onChange = () => {}, initial = 'activity' }) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs
      tabs={TABS}
      value={value}
      onChange={(id) => { setValue(id); onChange(id); }}
      ariaLabel="Autopilot sections"
    />
  );
}

describe('Tabs', () => {
  it('exposes a labelled tablist with the active tab marked selected', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Autopilot sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Activity/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Rules/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the tab id when clicked', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Rules/ }));
    expect(onChange).toHaveBeenCalledWith('rules');
  });

  it('moves selection with ArrowRight and wraps around', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial="rules" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('activity');
  });

  it('supports Home and End', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial="approvals" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('rules');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('activity');
  });

  it('renders a count badge only when count is above zero', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: /Needs approval/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /^Activity/ })).not.toHaveTextContent(/\d/);
  });

  it('keeps only the selected tab in the tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: /Activity/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Rules/ })).toHaveAttribute('tabindex', '-1');
  });
});
