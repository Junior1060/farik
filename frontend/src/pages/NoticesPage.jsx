import React, { useState } from 'react';
import { Bell, Plus, Send, Eye, Edit } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import useFetch from '../hooks/useFetch';
import { getNotices, createNotice, updateNotice } from '../services/noticeService';
import { getTenants } from '../services/tenantService';
import { getLeases } from '../services/leaseService';
import { getPayments } from '../services/paymentService';
import { formatDate, formatRelative, fullName } from '../utils/formatters';
import { useForm } from 'react-hook-form';

const generateNoticeBody = (tenantName, unitName, amount) =>
  `Dear ${tenantName},\n\nThis notice is to inform you that your rent payment of $${amount.toLocaleString()} for your unit (${unitName}) is overdue as of today.\n\nPlease remit payment immediately to avoid further action. If you have already submitted payment, please disregard this notice and contact us with proof of payment.\n\nThank you for your prompt attention to this matter.\n\nSincerely,\nYour Property Management Team`;

const NoticesPage = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [previewNotice, setPreviewNotice] = useState(null);
  const [generatingFor, setGeneratingFor] = useState(null);

  const { data, loading, error, refetch } = useFetch(getNotices);
  const { data: tenantsData } = useFetch(getTenants);
  const { data: paymentsData } = useFetch(getPayments);
  const { data: leasesData } = useFetch(getLeases);

  const notices = data?.notices || [];
  const tenants = tenantsData?.tenants || [];
  const leases = leasesData?.leases || [];

  // Get overdue tenants
  const overdueTenants = (paymentsData?.payments || [])
    .filter((p) => p.status === 'OVERDUE')
    .reduce((acc, p) => {
      if (!acc.find((t) => t.id === p.tenant?.id)) {
        acc.push({ ...p.tenant, overdueAmount: p.amount, unitName: p.lease?.unit?.name });
      }
      return acc;
    }, []);

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm();

  const watchTenantId = watch('tenantId');

  const onTenantChange = (tenantId) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant) {
      const lease = tenant.leases?.[0];
      const body = generateNoticeBody(
        fullName(tenant),
        lease?.unit?.name || 'your unit',
        lease?.monthlyRent || 0
      );
      setValue('body', body);
      setValue('title', `Late Rent Notice – ${tenant.firstName} ${tenant.lastName}`);
      if (lease?.id) setValue('leaseId', lease.id);
    }
  };

  const onSubmit = async (values) => {
    await createNotice({
      tenantId: values.tenantId,
      leaseId: values.leaseId || undefined,
      title: values.title,
      body: values.body,
      status: 'DRAFT',
    });
    setShowCreate(false);
    reset();
    refetch();
  };

  const sendNotice = async (notice) => {
    await updateNotice(notice.id, { status: 'SENT' });
    refetch();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  return (
    <div>
      <PageHeader
        title="Notices"
        description={`${notices.filter((n) => n.status === 'SENT').length} sent · ${notices.filter((n) => n.status === 'DRAFT').length} drafts`}
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Notice
          </button>
        }
      />

      {/* Overdue alerts */}
      {overdueTenants.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={15} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">{overdueTenants.length} tenants with overdue rent</h3>
          </div>
          <div className="space-y-2">
            {overdueTenants.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-t border-amber-100">
                <div>
                  <p className="text-sm font-medium text-amber-900">{fullName(t)}</p>
                  <p className="text-xs text-amber-700">{t.unitName} · ${t.overdueAmount?.toLocaleString()} overdue</p>
                </div>
                <button
                  className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  onClick={() => {
                    setShowCreate(true);
                    setTimeout(() => {
                      setValue('tenantId', t.id);
                      onTenantChange(t.id);
                    }, 100);
                  }}
                >
                  Generate Notice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}

      {notices.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notices yet"
          description="Generate late notices for overdue tenants or create custom notices."
          action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create Notice</button>}
        />
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <div key={notice.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-800">{notice.title}</h3>
                    <StatusBadge status={notice.status} />
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    To: {fullName(notice.tenant)} · {notice.lease?.unit?.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Created {formatRelative(notice.createdAt)}
                    {notice.sentAt && ` · Sent ${formatDate(notice.sentAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setPreviewNotice(notice)}
                    className="btn-ghost text-xs"
                  >
                    <Eye size={14} /> Preview
                  </button>
                  {notice.status === 'DRAFT' && (
                    <button
                      onClick={() => sendNotice(notice)}
                      className="btn-primary text-xs"
                    >
                      <Send size={14} /> Send
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 bg-surface-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">{notice.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Notice Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Notice" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Tenant *</label>
            <select
              className="input"
              {...register('tenantId', { required: true })}
              onChange={(e) => { register('tenantId').onChange(e); onTenantChange(e.target.value); }}
            >
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{fullName(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Late Rent Notice – April 2025" {...register('title', { required: true })} />
          </div>
          <input type="hidden" {...register('leaseId')} />
          <div>
            <label className="label">Notice Body *</label>
            <textarea rows={8} className="input resize-none font-mono text-xs" {...register('body', { required: true })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Draft'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!previewNotice} onClose={() => setPreviewNotice(null)} title="Notice Preview" size="lg">
        {previewNotice && (
          <div>
            <div className="bg-surface-50 border border-slate-200 rounded-xl p-5">
              <h2 className="font-semibold text-slate-800 mb-3">{previewNotice.title}</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{previewNotice.body}</p>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              {previewNotice.status === 'DRAFT' && (
                <button className="btn-primary" onClick={() => { sendNotice(previewNotice); setPreviewNotice(null); }}>
                  <Send size={15} /> Mark as Sent
                </button>
              )}
              <button className="btn-secondary" onClick={() => setPreviewNotice(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default NoticesPage;
