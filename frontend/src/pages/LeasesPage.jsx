import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchFilterBar from '../components/ui/SearchFilterBar';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import useFetch from '../hooks/useFetch';
import { getLeases, createLease, updateLease, deleteLease } from '../services/leaseService';
import { getProperties } from '../services/propertyService';
import { lookupTenantByEmail } from '../services/tenantService';
import { formatDate, formatCurrency, daysUntilLabel, fullName } from '../utils/formatters';
import { useForm } from 'react-hook-form';

const LeaseStatusFilter = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto">
    <option value="">All Statuses</option>
    <option value="ACTIVE">Active</option>
    <option value="EXPIRED">Expired</option>
    <option value="TERMINATED">Terminated</option>
    <option value="PENDING">Pending</option>
  </select>
);

const LeasesPage = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editLease, setEditLease] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, loading, error, refetch } = useFetch(getLeases);
  const leases = data?.leases || [];

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const filtered = leases.filter((l) => {
    const name = fullName(l.tenant).toLowerCase();
    const unit = l.unit?.name?.toLowerCase() || '';
    const q = search.toLowerCase();
    const matchSearch = name.includes(q) || unit.includes(q);
    const matchStatus = !statusFilter || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openEdit = (lease) => {
    setEditLease(lease);
    reset({
      monthlyRent: lease.monthlyRent,
      deposit: lease.deposit,
      status: lease.status,
      notes: lease.notes || '',
    });
  };

  const onEditSubmit = async (values) => {
    await updateLease(editLease.id, {
      ...values,
      monthlyRent: Number(values.monthlyRent),
      deposit: Number(values.deposit),
    });
    setEditLease(null);
    refetch();
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this lease?')) return;
    await deleteLease(id);
    refetch();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  );

  const activeCount = leases.filter((l) => l.status === 'ACTIVE').length;

  return (
    <div>
      <PageHeader
        title="Leases"
        description={`${activeCount} active leases · ${leases.length} total`}
        action={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Create lease
          </button>
        }
      />

      <div className="card mb-5">
        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search by tenant or unit...">
          <LeaseStatusFilter value={statusFilter} onChange={setStatusFilter} />
        </SearchFilterBar>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No leases found" description="No leases match your current filters." />
      ) : (
        <div className="grid gap-4">
          {filtered.map((lease) => {
            const daysLeft = daysUntilLabel(lease.endDate);
            const isExpiring = new Date(lease.endDate) < new Date(Date.now() + 30 * 86400000);

            return (
              <div key={lease.id} className={`card ${isExpiring && lease.status === 'ACTIVE' ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {lease.tenant?.firstName?.[0]}{lease.tenant?.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{fullName(lease.tenant)}</h3>
                        <StatusBadge status={lease.status} />
                        {isExpiring && lease.status === 'ACTIVE' && (
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                            {daysLeft}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {lease.unit?.name} · {lease.unit?.property?.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(lease)} className="btn-ghost text-xs">
                      <Edit size={14} /> Edit
                    </button>
                    <button onClick={() => onDelete(lease.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-400">Monthly Rent</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(lease.monthlyRent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Deposit</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(lease.deposit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Start Date</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(lease.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">End Date</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(lease.endDate)}</p>
                  </div>
                </div>

                {lease.notes && (
                  <p className="mt-3 text-xs text-slate-500 bg-surface-50 rounded-lg px-3 py-2 border border-slate-100">
                    {lease.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editLease} onClose={() => setEditLease(null)} title="Edit Lease">
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Monthly Rent ($)</label>
              <input type="number" className="input" {...register('monthlyRent', { required: true, min: 1 })} />
            </div>
            <div>
              <label className="label">Deposit ($)</label>
              <input type="number" className="input" {...register('deposit', { required: true, min: 0 })} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} className="input resize-none" {...register('notes')} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={() => setEditLease(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Lease Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create lease" size="lg">
        <CreateLeaseForm onSuccess={() => { setCreateOpen(false); refetch(); }} onCancel={() => setCreateOpen(false)} />
      </Modal>
    </div>
  );
};

const CreateLeaseForm = ({ onSuccess, onCancel }) => {
  const [emailInput, setEmailInput] = useState('');
  const [tenantLookup, setTenantLookup] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    unitId: '',
    startDate: '',
    endDate: '',
    monthlyRent: '',
    deposit: '',
    notes: '',
  });

  useEffect(() => {
    getProperties().then((d) => setProperties(d.properties || []));
  }, []);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const availableUnits = selectedProperty?.units.filter((u) => !u.isOccupied) || [];

  const handleLookup = async () => {
    if (!emailInput.trim()) return;
    setLooking(true);
    setLookupError('');
    setTenantLookup(null);
    try {
      const data = await lookupTenantByEmail(emailInput.trim());
      setTenantLookup(data);
    } catch (err) {
      setLookupError(err?.response?.data?.error || 'Tenant not found.');
    } finally {
      setLooking(false);
    }
  };

  const handleUnitChange = (unitId) => {
    const unit = availableUnits.find((u) => u.id === unitId);
    setForm((f) => ({ ...f, unitId, monthlyRent: unit ? String(unit.rentAmount) : f.monthlyRent }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tenantLookup) return;
    setSubmitting(true);
    setFormError('');
    try {
      await createLease({
        tenantId: tenantLookup.tenant.id,
        unitId: form.unitId,
        startDate: form.startDate,
        endDate: form.endDate,
        monthlyRent: Number(form.monthlyRent),
        deposit: Number(form.deposit),
        notes: form.notes,
      });
      onSuccess();
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to create lease.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Step 1: Tenant lookup */}
      <div>
        <label className="label">Tenant email *</label>
        <div className="flex gap-2">
          <input
            type="email"
            className="input flex-1"
            placeholder="tenant@email.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
          />
          <button type="button" className="btn-secondary" onClick={handleLookup} disabled={looking}>
            {looking ? 'Looking up...' : 'Look up'}
          </button>
        </div>
        {tenantLookup && (
          <div className="flex items-center gap-2 mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <CheckCircle size={14} />
            Found: <span className="font-medium">{tenantLookup.tenant.firstName} {tenantLookup.tenant.lastName}</span>
          </div>
        )}
        {lookupError && (
          <div className="flex items-start gap-2 mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{lookupError} Ask them to sign up at <strong>/register</strong> as a Tenant first.</span>
          </div>
        )}
      </div>

      {/* Step 2: Property & Unit */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Property *</label>
          <select className="input" value={selectedPropertyId} onChange={(e) => { setSelectedPropertyId(e.target.value); setForm((f) => ({ ...f, unitId: '' })); }}>
            <option value="">Select property</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unit *</label>
          <select className="input" value={form.unitId} onChange={(e) => handleUnitChange(e.target.value)} disabled={!selectedPropertyId}>
            <option value="">Select unit</option>
            {availableUnits.map((u) => <option key={u.id} value={u.id}>{u.name} (${u.rentAmount}/mo)</option>)}
          </select>
          {selectedPropertyId && availableUnits.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No vacant units in this property.</p>
          )}
        </div>
      </div>

      {/* Step 3: Dates & financials */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Start date *</label>
          <input type="date" className="input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
        </div>
        <div>
          <label className="label">End date *</label>
          <input type="date" className="input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Monthly rent ($) *</label>
          <input type="number" min="1" className="input" value={form.monthlyRent} onChange={(e) => setForm((f) => ({ ...f, monthlyRent: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Deposit ($) *</label>
          <input type="number" min="0" className="input" value={form.deposit} onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))} required />
        </div>
      </div>
      <div>
        <label className="label">Notes (optional)</label>
        <textarea rows={2} className="input resize-none" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>

      {formError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</div>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={submitting || !tenantLookup || !form.unitId}>
          {submitting ? 'Creating...' : 'Create lease'}
        </button>
      </div>
    </form>
  );
};

export default LeasesPage;
