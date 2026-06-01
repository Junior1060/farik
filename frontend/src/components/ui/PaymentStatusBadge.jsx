import React from 'react';

const variants = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  OVERDUE: 'bg-red-50 text-red-700 border-red-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
};

const labels = {
  PAID: 'Paid',
  PENDING: 'Pending',
  OVERDUE: 'Overdue',
  PARTIAL: 'Partial',
};

const PaymentStatusBadge = ({ status, className = '' }) => {
  const style = variants[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}>
      {labels[status] || status}
    </span>
  );
};

export default PaymentStatusBadge;
