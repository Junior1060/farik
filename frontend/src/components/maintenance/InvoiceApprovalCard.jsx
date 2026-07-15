import React, { useState } from 'react';
import { FileText, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { approveInvoice, rejectInvoice } from '../../services/invoiceApi';
import { assetUrl } from '../../services/api';
import { formatDate } from '../../utils/formatters';

const STATUS_STYLES = {
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  NEEDS_INFO: 'bg-slate-100 text-slate-600',
};

export default function InvoiceApprovalCard({ invoice, approvedEstimateMax, onChange }) {
  const [busy, setBusy] = useState(false);
  const extracted = invoice.extracted;
  const overBudget = approvedEstimateMax != null && invoice.extractedAmount != null && invoice.extractedAmount > approvedEstimateMax;

  const handleApprove = async () => {
    setBusy(true);
    try {
      const updated = await approveInvoice(invoice.id);
      onChange?.(updated);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt('Reason for rejecting this invoice?');
    if (!reason) return;
    setBusy(true);
    try {
      const updated = await rejectInvoice(invoice.id, reason);
      onChange?.(updated);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <FileText size={16} className="text-slate-500" />
          </div>
          <div className="min-w-0">
            <a href={assetUrl(`/uploads/invoices/${invoice.storedName}`)} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline truncate block">
              {invoice.originalName}
            </a>
            <p className="text-xs text-slate-400">Uploaded {formatDate(invoice.createdAt)}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[invoice.approvalStatus]}`}>
          {invoice.approvalStatus.replace('_', ' ')}
        </span>
      </div>

      {extracted && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
          {extracted.vendorName && <div><span className="text-slate-400">Vendor:</span> {extracted.vendorName}</div>}
          {extracted.invoiceNumber && <div><span className="text-slate-400">Invoice #:</span> {extracted.invoiceNumber}</div>}
          {extracted.invoiceDate && <div><span className="text-slate-400">Date:</span> {extracted.invoiceDate}</div>}
          {invoice.extractedAmount != null && <div><span className="text-slate-400">Total:</span> ${invoice.extractedAmount}</div>}
        </div>
      )}

      {overBudget && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          This invoice (${invoice.extractedAmount}) exceeds the approved estimate (${approvedEstimateMax}). Review carefully before approving.
        </div>
      )}

      {invoice.approvalStatus === 'PENDING_REVIEW' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleApprove}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 size={13} /> Approve
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
          >
            <XCircle size={13} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
