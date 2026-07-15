import React, { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import WorkflowTimeline from '../components/maintenance/WorkflowTimeline';
import VendorContactPanel from '../components/maintenance/VendorContactPanel';
import InvoiceApprovalCard from '../components/maintenance/InvoiceApprovalCard';
import useFetch from '../hooks/useFetch';
import { getMaintenanceRequestDetail, approveMaintenanceWorkflow, cancelMaintenanceWorkflow } from '../services/maintenanceService';
import { uploadInvoice } from '../services/invoiceApi';
import { assetUrl } from '../services/api';
import { formatRelative, fullName } from '../utils/formatters';

const STATE_LABELS = {
  INTAKE_RECEIVED: 'Intake received',
  DIAGNOSTIC_QUESTIONS_SENT: 'Awaiting tenant details',
  DIAGNOSTIC_RESPONSE_RECEIVED: 'Diagnostics received',
  TRIAGED: 'Triaged',
  EMERGENCY_ESCALATED: 'Emergency — escalated',
  AWAITING_LANDLORD_APPROVAL: 'Awaiting your approval',
  APPROVED: 'Approved',
  VENDOR_SELECTION: 'Selecting vendor',
  VENDOR_CONTACT_ATTEMPTED: 'Vendor contacted',
  VENDOR_CONTACT_FAILED: 'Vendor did not respond',
  VENDOR_CONFIRMED: 'Vendor confirmed',
  VENDOR_DECLINED: 'Vendor declined',
  APPOINTMENT_PROPOSED: 'Appointment proposed',
  APPOINTMENT_CONFIRMED: 'Appointment confirmed',
  APPOINTMENT_RESCHEDULED: 'Appointment rescheduled',
  WORK_IN_PROGRESS: 'Work in progress',
  WORK_COMPLETED_PENDING_INVOICE: 'Awaiting invoice',
  INVOICE_RECEIVED: 'Invoice received',
  INVOICE_EXTRACTED: 'Invoice extracted',
  INVOICE_APPROVED: 'Invoice approved',
  INVOICE_DISPUTED: 'Invoice disputed',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
  ESCALATED_MANUAL: 'Needs manual review',
};

export default function MaintenanceDetailPage() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useFetch(() => getMaintenanceRequestDetail(id), [id]);
  const [busy, setBusy] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    try {
      await approveMaintenanceWorkflow(id);
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [id, refetch]);

  const handleCancel = useCallback(async () => {
    const reason = window.prompt('Reason for cancelling this workflow?');
    if (!reason) return;
    setBusy(true);
    try {
      await cancelMaintenanceWorkflow(id, reason);
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [id, refetch]);

  const handleInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInvoice(true);
    try {
      await uploadInvoice(id, file);
      await refetch();
    } finally {
      setUploadingInvoice(false);
      e.target.value = '';
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  if (error || !data) return <div className="p-6 text-red-600 text-sm">{error || 'Not found'}</div>;

  const { request, timeline, contactAttempts } = data;
  const workflow = request.workflow;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/maintenance" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={14} /> Back to Maintenance
      </Link>

      <PageHeader
        title={request.title}
        description={`${fullName(request.tenant)} · ${request.unit?.name} · ${request.unit?.property?.name}`}
        action={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={request.priority} />
            <StatusBadge status={request.status} />
          </div>
        }
      />

      {workflow?.isEmergency && (
        <div className="mt-4 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          This was flagged as an emergency by deterministic safety rules and escalated immediately.
        </div>
      )}

      {workflow && (
        <div className="card mt-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Workflow status</p>
            <p className="text-base font-semibold text-slate-800 mt-0.5">{STATE_LABELS[workflow.state] || workflow.state}</p>
          </div>
          {workflow.state === 'AWAITING_LANDLORD_APPROVAL' && (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 size={14} /> Approve
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-xl hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                <XCircle size={14} /> Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Details</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{request.description}</p>
          {request.photos?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {request.photos.map((src, i) => (
                <a key={i} href={assetUrl(src)} target="_blank" rel="noreferrer">
                  <img src={assetUrl(src)} alt={`Photo ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                </a>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">Submitted {formatRelative(request.createdAt)}</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Vendors contacted</h3>
          <VendorContactPanel attempts={contactAttempts} />
        </div>

        <div className="card md:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Timeline</h3>
          <WorkflowTimeline events={timeline} />
        </div>

        <div className="card md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Invoices</h3>
            <label className="text-xs font-medium text-brand-600 hover:underline cursor-pointer">
              {uploadingInvoice ? 'Uploading…' : 'Upload invoice'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleInvoiceUpload} disabled={uploadingInvoice} />
            </label>
          </div>
          {request.invoices?.length > 0 ? (
            <div className="space-y-3">
              {request.invoices.map((invoice) => (
                <InvoiceApprovalCard key={invoice.id} invoice={invoice} onChange={refetch} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No invoices uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
