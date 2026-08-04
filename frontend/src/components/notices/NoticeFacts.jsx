import React from 'react';
import { formatCurrency, formatDate, fullName } from '../../utils/formatters';

/**
 * The read-only record of what Farik used to build a draft, so the landlord can
 * verify the underlying data before approving anything.
 */
export default function NoticeFacts({ facts }) {
  const rows = [
    ['Notice type', facts.typeLabel],
    ['Tenant', facts.tenant ? fullName(facts.tenant) : 'Not selected'],
    ['Property and unit', facts.location || 'No active lease on record'],
    ['Outstanding amount', facts.outstanding > 0 ? formatCurrency(facts.outstanding) : 'None recorded'],
    ['Original due date', facts.dueDate ? formatDate(facts.dueDate) : 'Not applicable'],
    [
      'Lease used',
      facts.lease
        ? `${formatCurrency(facts.lease.monthlyRent)}/month · ${formatDate(facts.lease.startDate)} – ${formatDate(facts.lease.endDate)}`
        : 'No lease linked',
    ],
    ['Delivery method', facts.deliveryMethod],
  ];

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-50 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Information Farik used
        </h3>
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 px-4 py-2.5">
            <dt className="text-xs text-slate-500 sm:w-44 flex-shrink-0">{label}</dt>
            <dd className="text-sm text-slate-800 font-medium min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
