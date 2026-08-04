import React, { useId } from 'react';
import { Lock } from 'lucide-react';
import Switch from '../ui/Switch';

/** One configurable Autopilot rule: label, description, and its control. */
export default function RuleRow({ rule, value, onChange, disabled = false, note }) {
  const id = useId();
  const { label, description, control, options } = rule;

  if (control === 'switch') {
    return (
      <div className="py-1">
        <Switch
          checked={!!value}
          onChange={onChange}
          label={label}
          description={note || description}
          disabled={disabled}
        />
      </div>
    );
  }

  const controlEl =
    control === 'select' ? (
      <select
        id={id}
        className="input w-auto min-w-[10rem]"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    ) : control === 'currency' ? (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
        <input
          id={id}
          type="number"
          min="0"
          step="25"
          className="input pl-7 w-32"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    ) : control === 'time' ? (
      <input
        id={id}
        type="time"
        className="input w-32"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input
        id={id}
        type="number"
        min="0"
        className="input w-24"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-slate-800">{label}</label>
        <p className="text-xs text-slate-500 mt-0.5">{note || description}</p>
      </div>
      <div className="flex-shrink-0">{controlEl}</div>
    </div>
  );
}

/** A safety rule that no setting can weaken. */
export function LockedRuleRow({ rule }) {
  return (
    <div className="flex items-start gap-3 py-3.5 px-3">
      <Lock size={16} className="text-slate-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{rule.label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
      </div>
      <span className="ml-auto text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full flex-shrink-0">
        Always on
      </span>
    </div>
  );
}
