import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Callers routinely pass an inline arrow for onClose, so keep it in a ref:
  // the focus effect below must depend on `open` alone, or it would re-run on
  // every render and yank focus out of whatever the user is typing into.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape to close + focus in on open, restored on close.
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative bg-white rounded-2xl shadow-card-lg w-full ${sizes[size]} max-h-[90vh] overflow-y-auto border border-slate-200 focus:outline-none`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
