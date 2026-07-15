import React from 'react';
import { Eye, FileEdit, ShieldCheck, Cog, Siren } from 'lucide-react';

export const TRUST_LEVELS = [
  {
    value: 'OBSERVE',
    label: 'Observe',
    icon: Eye,
    description: 'Monitors activity and identifies issues, but never sends messages or takes action.',
  },
  {
    value: 'DRAFT',
    label: 'Draft',
    icon: FileEdit,
    description: 'Prepares draft messages, notices, and actions. Every action needs your approval.',
  },
  {
    value: 'EXECUTE_WITH_APPROVAL',
    label: 'Execute With Approval',
    icon: ShieldCheck,
    description: 'Prepares the full workflow; one approval authorizes Farik to follow it through.',
  },
  {
    value: 'OPERATE_WITHIN_POLICY',
    label: 'Operate Within Policy',
    icon: Cog,
    description: 'Automatically performs routine actions that fall within your configured policies.',
  },
  {
    value: 'EMERGENCY_ESCALATION',
    label: 'Emergency Escalation',
    icon: Siren,
    description: 'Immediately escalates dangerous situations to emergency contacts and you.',
  },
];

export default function TrustLevelSelector({ value, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      {TRUST_LEVELS.map(({ value: level, label, icon: Icon, description }) => {
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => onChange(level)}
            className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-colors disabled:opacity-50 ${
              selected
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon size={18} className={`flex-shrink-0 mt-0.5 ${selected ? 'text-brand-600' : 'text-slate-400'}`} />
            <div>
              <p className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-slate-700'}`}>{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
