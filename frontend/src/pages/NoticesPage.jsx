import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Plus, Eye, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import InfoBanner from '../components/ui/InfoBanner';
import NoticeFacts from '../components/notices/NoticeFacts';
import { noticeStatus, NOTICE_TYPES, noticeTypeFor } from '../components/notices/noticeStatus';
import useFetch from '../hooks/useFetch';
import { getNotices, createNotice, updateNotice } from '../services/noticeService';
import { getTenants } from '../services/tenantService';
import { getPayments } from '../services/paymentService';
import { getEscalations } from '../services/agentService';
import { getMessagingConfig } from '../services/profileService';
import { formatCurrency, formatDate, formatRelative, fullName } from '../utils/formatters';

const REVIEW_NOTE =
  'Farik prepares this draft using the available lease and payment information. Review the notice before sending. Farik does not provide legal advice.';

function draftBody({ typeId, tenantName, unitName, amount, dueDate, landlordName }) {
  const signature = `\n\nSincerely,\n${landlordName || 'Your property manager'}`;
  if (typeId === 'LATE_RENT') {
    return `Dear ${tenantName},\n\nOur records show an outstanding balance of ${formatCurrency(amount || 0)} for ${unitName}${
      dueDate ? `, originally due on ${formatDate(dueDate)}` : ''
    }.\n\nPlease arrange payment or contact us to discuss an arrangement. If you have already paid, please disregard this notice and send us confirmation.${signature}`;
  }
  if (typeId === 'LEASE_RENEWAL') {
    return `Dear ${tenantName},\n\nYour lease for ${unitName} is approaching its end date. We would be glad to continue the tenancy.\n\nPlease let us know whether you would like to renew so we can prepare the paperwork.${signature}`;
  }
  if (typeId === 'ENTRY') {
    return `Dear ${tenantName},\n\nThis is written notice that access to ${unitName} is required so that scheduled work can be completed.\n\nPlease confirm the proposed date and time, or let us know an alternative that suits you.${signature}`;
  }
  return `Dear ${tenantName},\n\n[Write your notice here.]${signature}`;
}

const emptyForm = { tenantId: '', typeId: 'LATE_RENT', title: '', body: '' };

const NoticesPage = () => {
  const [composer, setComposer] = useState(null); // null | form object
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [messagingNumber, setMessagingNumber] = useState(null);

  const { data, loading, error, refetch } = useFetch(getNotices);
  const { data: tenantsData } = useFetch(getTenants);
  const { data: paymentsData } = useFetch(getPayments);

  const notices = data?.notices || [];
  const tenants = useMemo(() => tenantsData?.tenants || [], [tenantsData]);
  const payments = useMemo(() => paymentsData?.payments || [], [paymentsData]);

  // Notices Farik has prepared and parked in the Autopilot approval queue.
  // These are AgentLog rows, not Notice rows — shown read-only for visibility.
  useEffect(() => {
    let cancelled = false;
    getEscalations()
      .then((logs) => {
        if (cancelled) return;
        setPendingDrafts(
          logs
            .map((log) => {
              try {
                const draft = JSON.parse(log.draftContent || 'null');
                return draft?.type === 'notice' ? { log, draft } : null;
              } catch { return null; }
            })
            .filter(Boolean),
        );
      })
      .catch(() => { /* the queue is supplementary; the list still works */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMessagingConfig()
      .then((d) => { if (!cancelled) setMessagingNumber(d?.messagingNumber ?? null); })
      .catch(() => { /* treat as unconfigured */ });
    return () => { cancelled = true; };
  }, []);

  const deliveryMethod = messagingNumber
    ? `Tenant portal, and by text from ${messagingNumber}`
    : 'Tenant portal only — no messaging number is configured';

  const overdueByTenant = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      if (p.status !== 'OVERDUE' || !p.tenant?.id) continue;
      const current = map.get(p.tenant.id) || { tenant: p.tenant, amount: 0, dueDate: null, unitName: p.lease?.unit?.name };
      current.amount += p.amount;
      if (!current.dueDate || new Date(p.dueDate) < new Date(current.dueDate)) current.dueDate = p.dueDate;
      map.set(p.tenant.id, current);
    }
    return map;
  }, [payments]);

  const overdueTenants = [...overdueByTenant.values()];

  const factsFor = (form) => {
    const tenant = tenants.find((t) => t.id === form.tenantId);
    const lease = tenant?.leases?.[0] || null;
    const overdue = overdueByTenant.get(form.tenantId);
    return {
      tenant,
      lease,
      typeLabel: noticeTypeFor(form.typeId).label,
      location: lease?.unit
        ? [lease.unit.name, lease.unit.property?.name].filter(Boolean).join(', ')
        : null,
      outstanding: overdue?.amount || 0,
      dueDate: overdue?.dueDate || null,
      deliveryMethod,
    };
  };

  const openComposer = (tenantId = '') => {
    setActionError('');
    const form = { ...emptyForm, tenantId };
    setComposer(tenantId ? applyTenant(form, tenantId, form.typeId) : form);
  };

  function applyTenant(form, tenantId, typeId) {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return { ...form, tenantId, typeId };
    const lease = tenant.leases?.[0];
    const overdue = overdueByTenant.get(tenantId);
    const type = noticeTypeFor(typeId);
    return {
      ...form,
      tenantId,
      typeId,
      title: `${type.prefix} — ${fullName(tenant)}`,
      body: draftBody({
        typeId,
        tenantName: fullName(tenant),
        unitName: lease?.unit?.name || 'your unit',
        amount: overdue?.amount ?? lease?.monthlyRent ?? 0,
        dueDate: overdue?.dueDate,
      }),
    };
  }

  const handleSaveDraft = async () => {
    setSaving(true);
    setActionError('');
    try {
      const tenant = tenants.find((t) => t.id === composer.tenantId);
      await createNotice({
        tenantId: composer.tenantId,
        leaseId: tenant?.leases?.[0]?.id || undefined,
        title: composer.title,
        body: composer.body,
        status: 'DRAFT',
      });
      setComposer(null);
      refetch();
    } catch (err) {
      setActionError(err?.response?.data?.error || 'The draft could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (notice) => {
    setSaving(true);
    setActionError('');
    try {
      await updateNotice(notice.id, { status: 'SENT' });
      setPreview(null);
      refetch();
    } catch (err) {
      setActionError(err?.response?.data?.error || 'The notice could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  const drafts = notices.filter((n) => n.status === 'DRAFT');
  const recorded = notices.filter((n) => n.status === 'SENT');

  return (
    <div>
      <PageHeader
        title="Notices"
        description={`${drafts.length} draft${drafts.length === 1 ? '' : 's'} · ${pendingDrafts.length} awaiting approval · ${recorded.length} recorded as sent`}
        action={
          <button className="btn-primary" onClick={() => openComposer()}>
            <Plus size={16} aria-hidden="true" /> Create draft
          </button>
        }
      />

      <InfoBanner variant="warning" className="mb-5">
        {REVIEW_NOTE} Approving records a notice in Farik and shows it to the tenant in their portal — Farik does not
        transmit it for you.
      </InfoBanner>

      {actionError && <InfoBanner variant="danger" className="mb-4">{actionError}</InfoBanner>}
      {error && <InfoBanner variant="danger" className="mb-4">{error}</InfoBanner>}

      {/* Overdue tenants */}
      {overdueTenants.length > 0 && (
        <section className="card border-amber-200 bg-amber-50 mb-5" aria-labelledby="overdue-heading">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-700" aria-hidden="true" />
            <h2 id="overdue-heading" className="text-sm font-semibold text-amber-900">
              {overdueTenants.length} tenant{overdueTenants.length === 1 ? '' : 's'} with overdue rent
            </h2>
          </div>
          <ul className="space-y-2">
            {overdueTenants.map((t) => (
              <li key={t.tenant.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 border-t border-amber-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-900">{fullName(t.tenant)}</p>
                  <p className="text-xs text-amber-800">
                    {t.unitName ? `${t.unitName} · ` : ''}{formatCurrency(t.amount)} overdue
                    {t.dueDate ? ` since ${formatDate(t.dueDate)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors self-start sm:self-auto flex-shrink-0"
                  onClick={() => openComposer(t.tenant.id)}
                >
                  Create draft
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Farik-prepared drafts waiting in the approval queue */}
      {pendingDrafts.length > 0 && (
        <section className="mb-5 space-y-3" aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="section-title">Prepared by Farik, awaiting your approval</h2>
          {pendingDrafts.map(({ log, draft }) => (
            <article key={log.id} className="card border-amber-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800">{draft.title || log.summary}</h3>
                  <p className="text-xs text-slate-500 mt-1">Prepared {formatRelative(log.createdAt)}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${noticeStatus('AWAITING_APPROVAL').badge}`}>
                  {noticeStatus('AWAITING_APPROVAL').label}
                </span>
              </div>
              <Link
                to="/autopilot?tab=approvals"
                className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline mt-3"
              >
                Review in Autopilot <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      )}

      {notices.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notices yet"
          description="Create a draft for an overdue tenant, or start a notice from scratch. Nothing is recorded until you approve it."
          action={
            <button className="btn-primary" onClick={() => openComposer()}>
              <Plus size={16} aria-hidden="true" /> Create draft
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => {
            const status = noticeStatus(notice.status);
            return (
              <li key={notice.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800">{notice.title}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${status.badge}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      To: {fullName(notice.tenant)}{notice.lease?.unit?.name ? ` · ${notice.lease.unit.name}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Created {formatRelative(notice.createdAt)}
                      {notice.sentAt && ` · Recorded as sent ${formatDate(notice.sentAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button onClick={() => setPreview(notice)} className="btn-secondary text-xs">
                      <Eye size={14} aria-hidden="true" /> Preview
                    </button>
                    {notice.status === 'DRAFT' && (
                      <button onClick={() => setPreview(notice)} className="btn-primary text-xs">
                        <CheckCircle2 size={14} aria-hidden="true" /> Review and approve
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 bg-surface-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">
                  {notice.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Composer */}
      <Modal open={!!composer} onClose={() => setComposer(null)} title="Create notice draft" size="lg">
        {composer && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="notice-tenant">Tenant</label>
                <select
                  id="notice-tenant"
                  className="input"
                  value={composer.tenantId}
                  onChange={(e) => setComposer((f) => applyTenant(f, e.target.value, f.typeId))}
                >
                  <option value="">Select tenant…</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="notice-type">Notice type</label>
                <select
                  id="notice-type"
                  className="input"
                  value={composer.typeId}
                  onChange={(e) => setComposer((f) => applyTenant(f, f.tenantId, e.target.value))}
                >
                  {NOTICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <NoticeFacts facts={factsFor(composer)} />

            <div>
              <label className="label" htmlFor="notice-title">Title</label>
              <input
                id="notice-title"
                className="input"
                value={composer.title}
                onChange={(e) => setComposer((f) => ({ ...f, title: e.target.value }))}
                placeholder="Late rent notice — Alice Morgan"
              />
            </div>

            <div>
              <label className="label" htmlFor="notice-body">Notice body</label>
              <textarea
                id="notice-body"
                rows={10}
                className="input resize-none text-xs font-mono"
                value={composer.body}
                onChange={(e) => setComposer((f) => ({ ...f, body: e.target.value }))}
              />
            </div>

            <InfoBanner variant="warning">{REVIEW_NOTE}</InfoBanner>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-1">
              <button type="button" className="btn-secondary justify-center" onClick={() => setComposer(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary justify-center"
                onClick={handleSaveDraft}
                disabled={saving || !composer.tenantId || !composer.title || !composer.body}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Notice preview" size="lg">
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${noticeStatus(preview.status).badge}`}>
                {noticeStatus(preview.status).label}
              </span>
              <span className="text-xs text-slate-500">{noticeStatus(preview.status).description}</span>
            </div>

            <div className="bg-surface-50 border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 mb-1">{preview.title}</h3>
              <p className="text-xs text-slate-500 mb-3">
                To {fullName(preview.tenant)}{preview.lease?.unit?.name ? ` · ${preview.lease.unit.name}` : ''}
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{preview.body}</p>
            </div>

            <p className="text-xs text-slate-500">Delivery method: {deliveryMethod}</p>

            {preview.status === 'DRAFT' ? (
              <>
                <InfoBanner variant="warning">{REVIEW_NOTE}</InfoBanner>
                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <button type="button" className="btn-secondary justify-center" onClick={() => setPreview(null)}>
                    Keep as draft
                  </button>
                  <button
                    type="button"
                    className="btn-primary justify-center"
                    onClick={() => handleApprove(preview)}
                    disabled={saving}
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {saving ? 'Recording…' : 'Approve and record as sent'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end">
                <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>Close</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default NoticesPage;
