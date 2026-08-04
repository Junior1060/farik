import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../Modal';

describe('Modal', () => {
  it('is exposed as a labelled dialog', () => {
    render(<Modal open onClose={() => {}} title="Create notice draft">body</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Create notice draft' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden">body</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Dialog">body</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('gives the close button an accessible name', () => {
    render(<Modal open onClose={() => {}} title="Dialog">body</Modal>);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Modal open onClose={() => {}} title="Dialog">body</Modal>);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  // Callers pass inline arrows for onClose. If the focus effect depended on
  // that identity it would re-run every render and steal focus mid-typing.
  it('does not steal focus from a field while the user types', () => {
    function Harness() {
      const [value, setValue] = useState('');
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="Composer">
          <input aria-label="Notice body" value={value} onChange={(e) => setValue(e.target.value)} />
        </Modal>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Notice body');
    input.focus();
    fireEvent.change(input, { target: { value: 'Dear tenant' } });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'Dear tenant,' } });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('Dear tenant,');
  });

  it('restores focus to the trigger when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Dialog">body</Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
