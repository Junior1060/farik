import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, Mail, Phone, MessageSquare, Building2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import InfoBanner from '../components/ui/InfoBanner';
import Modal from '../components/ui/Modal';
import Tabs from '../components/ui/Tabs';
import { getPilotApplications, updatePilotApplication } from '../services/pilotAdminService';
import { formatDate, formatRelative } from '../utils/formatters';

const STATUSES = [
  { id: 'NEW', label: 'New', badge: 'bg-brand-50 text-brand-700 border-brand-200' },
  { id: 'CONTACTED', label: 'Contacted', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  { id: 'CALL_BOOKED', label: 'Call booked', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'PILOT_ACCEPTED', label: 'Accepted', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'PILOT_DECLINED', label: 'Declined', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const statusMeta = (id) => STATUSES.find((s) => s.id === id) || { label: id, badge: 'bg-slate-100 text-slate-700 border-slate-200' };

const CONTACT_ICON = { EMAIL: Mail, PHONE: Phone, TEXT: MessageSquare };
const CONTACT_LABEL = { EMAIL: 'Email', PHONE: 'Phone', TEXT: 'Text message' };

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 font-medium mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export default function PilotApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({ status: 'NEW', internalNotes: '', bookedCallAt: '', bookingReference: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setApplications(await getPilotApplications());
    } catch (err) {
      if (err?.response?.status === 403) setForbidden(true);
      else setError('Could not load pilot applications. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openApplication = (app) => {
    setOpen(app);
    setDraft({
      status: app.status,
      internalNotes: app.internalNotes || '',
      bookedCallAt: app.bookedCallAt ? new Date(app.bookedCallAt).toISOString().slice(0, 16) : '',
      bookingReference: app.bookingReference || '',
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await updatePilotApplication(open.id, {
        status: draft.status,
        internalNotes: draft.internalNotes || null,
        bookedCallAt: draft.bookedCallAt ? new Date(draft.bookedCallAt).toISOString() : null,
        bookingReference: draft.bookingReference || null,
      });
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setOpen(null);
    } catch {
      setError('That change could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>;

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Pilot applications" />
        <InfoBanner variant="warning" title="Administrator access required">
          Your account is not on the Farik administrator allowlist, so pilot applications are not
          visible here. Ask an administrator to add your email address.
        </InfoBanner>
      </div>
    );
  }

  const visible = filter === 'ALL' ? applications : applications.filter((a) => a.status === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, applications.filter((a) => a.status === s.id).length]));

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Pilot applications"
        description={`${applications.length} application${applications.length === 1 ? '' : 's'} · ${counts.NEW || 0} new`}
        action={
          <button type="button" onClick={load} className="btn-secondary">
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        }
      />

      {error && <InfoBanner variant="danger" className="mb-4">{error}</InfoBanner>}

      <div className="mb-5 overflow-x-auto">
        <Tabs
          tabs={[
            { id: 'ALL', label: 'All', count: applications.length },
            ...STATUSES.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] })),
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter applications by status"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={applications.length === 0 ? 'No applications yet' : 'Nothing matches this filter'}
          description={
            applications.length === 0
              ? 'Applications submitted from the pilot section of the homepage appear here.'
              : 'Try another status.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((app) => {
            const Icon = CONTACT_ICON[app.preferredContactMethod] || Mail;
            const meta = statusMeta(app.status);
            return (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => openApplication(app)}
                  className="card w-full text-left hover:shadow-card-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-slate-900">{app.fullName}</h2>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}>
                          {meta.label}
                        </span>
                        {app.bookedCallAt && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                            Call {formatDate(app.bookedCallAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1 break-words">
                        {app.email} · {app.phone}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                        <Building2 size={11} aria-hidden="true" />
                        {app.city} · {app.unitsManaged} unit{app.unitsManaged === 1 ? '' : 's'}
                        <span aria-hidden="true">·</span>
                        <Icon size={11} aria-hidden="true" />
                        Prefers {CONTACT_LABEL[app.preferredContactMethod] || app.preferredContactMethod}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 flex-shrink-0">{formatRelative(app.createdAt)}</p>
                  </div>
                  <p className="mt-3 bg-surface-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-600 line-clamp-2">
                    {app.biggestProblem}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.fullName || 'Application'} size="lg">
        {open && (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Detail label="Email"><a href={`mailto:${open.email}`} className="text-brand-600 hover:underline">{open.email}</a></Detail>
              <Detail label="Phone"><a href={`tel:${open.phone}`} className="text-brand-600 hover:underline">{open.phone}</a></Detail>
              <Detail label="City">{open.city}</Detail>
              <Detail label="Units managed">{open.unitsManaged}</Detail>
              <Detail label="Preferred contact">{CONTACT_LABEL[open.preferredContactMethod] || open.preferredContactMethod}</Detail>
              <Detail label="Submitted">{formatDate(open.createdAt)}</Detail>
              <Detail label="Company or property">{open.companyName || '—'}</Detail>
              <Detail label="Manages today">{open.currentManagementMethod || '—'}</Detail>
              <Detail label="Source">{open.source}</Detail>
            </dl>

            <div>
              <p className="text-xs text-slate-500 mb-1">What takes the most time</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap bg-surface-50 border border-slate-200 rounded-xl p-3.5 leading-relaxed">
                {open.biggestProblem}
              </p>
            </div>

            {open.additionalNotes && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Anything else</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-surface-50 border border-slate-200 rounded-xl p-3.5 leading-relaxed">
                  {open.additionalNotes}
                </p>
              </div>
            )}

            <div className="border-t border-slate-100 pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="pilot-status">Status</label>
                  <select
                    id="pilot-status"
                    className="input"
                    value={draft.status}
                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                  >
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pilot-call">Call booked for</label>
                  <input
                    id="pilot-call"
                    type="datetime-local"
                    className="input"
                    value={draft.bookedCallAt}
                    onChange={(e) => setDraft((d) => ({ ...d, bookedCallAt: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="pilot-ref">Booking reference</label>
                <input
                  id="pilot-ref"
                  className="input"
                  placeholder="Cal.com / Calendly booking id"
                  value={draft.bookingReference}
                  onChange={(e) => setDraft((d) => ({ ...d, bookingReference: e.target.value }))}
                />
              </div>

              <div>
                <label className="label" htmlFor="pilot-notes">Internal notes</label>
                <textarea
                  id="pilot-notes"
                  rows={4}
                  className="input resize-none"
                  placeholder="Not visible to the applicant."
                  value={draft.internalNotes}
                  onChange={(e) => setDraft((d) => ({ ...d, internalNotes: e.target.value }))}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button type="button" className="btn-secondary justify-center" onClick={() => setOpen(null)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary justify-center" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
