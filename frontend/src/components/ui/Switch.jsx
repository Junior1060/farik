import React from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';

/**
 * On/off control. Keeps the lucide toggle visual the app already used, but is a
 * real `role="switch"` so screen readers and keyboards see the state.
 */
const Switch = ({ checked, onChange, label, description, disabled = false, id }) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={!!checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-start gap-3 w-full py-3 px-3 rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
    }`}
  >
    {checked
      ? <ToggleRight size={22} className="text-brand-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
      : <ToggleLeft size={22} className="text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />}
    <span className="min-w-0">
      <span className={`block text-sm font-medium ${checked ? 'text-slate-800' : 'text-slate-600'}`}>{label}</span>
      {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
    </span>
    <span className="ml-auto text-xs font-semibold text-slate-500 flex-shrink-0 mt-0.5">
      {checked ? 'On' : 'Off'}
    </span>
  </button>
);

export default Switch;
