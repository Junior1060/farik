import React, { useState } from 'react';
import { CreditCard, Plus, Edit2, CheckCircle, DollarSign, Clock, AlertCircle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchFilterBar from '../components/ui/SearchFilterBar';
import PaymentStatusBadge from '../components/ui/PaymentStatusBadge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import useFetch from '../hooks/useFetch';
import { getPayments, updatePayment, createPayment } from '../services/paymentService';
import { getTenants } from '../services/tenantService';
import { getLeases } from '../services/leaseService';
import { formatDate, formatCurrency, fullName } from '../utils/formatters';
import { useForm } from 'react-hook-form';

const PaymentsPage = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editPayment, setEditPayment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, loading, error, refetch } = useFetch(getPayments);
  const { data: tenantsData } = useFetch(getTenants);
  const { data: leasesData } = useFetch(getLeases);

  const payments = data?.payments || [];
  const summary = data?.summary || {};
  const tenants = tenantsData?.tenants || [];
  const leases = leasesData?.leases || [];

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm();
  const { register: regAdd, handleSubmit: handleAdd, reset: resetAdd, formState: { isSubmitting: isAdding } } = useForm();

  const filtered = payments.filter((p) => {
    const name = fullName(p.tenant).toLowerCase();
    const unit = p.lease?.unit?.name?.toLowerCase() || '';
    const q = search.toLowerCase();
    const matchSearch = name.includes(q) || unit.includes(q);
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openEdit = (payment) => {
    setEditPayment(payment);
    reset({ status: payment.status, paidDate: payment.paidDate?.slice(0, 10) || '' });
  };

  const onEditSubmit = async (values) => {
    await updatePayment(editPayment.id, {
      status: values.status,
      paidDate: values.paidDate || null,
    });
    setEditPayment(null);
    refetch();
  };

  const onAddSubmit = async (values) => {
    await createPayment({
      leaseId: values.leaseId,
      tenantId: values.tenantId,
      amount: Number(values.amount),
      dueDate: values.dueDate,
      paidDate: values.paidDate || null,
      status: values.status || 'PENDING',
      description: values.description,
    });
    setShowAddModal(false);
    resetAdd();
    refetch();
  };

  const markPaid = async (payment) => {
    await updatePayment(payment.id, { status: 'PAID', paidDate: new Date().toISOString().slice(0, 10) });
    refetch();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Track and manage rent payments"
        action={
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Record Payment
          </button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="Collected" value={formatCurrency(summary.totalCollected || 0)} icon={CheckCircle} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard title="Pending" value={formatCurrency(summary.totalPending || 0)} icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" />
        <StatCard title="Overdue" value={formatCurrency(summary.totalOverdue || 0)} icon={AlertCircle} iconBg="bg-red-50" iconColor="text-red-600" />
        <StatCard title="Partial" value={formatCurrency(summary.totalPartial || 0)} icon={DollarSign} iconBg="bg-blue-50" iconColor="text-blue-600" />
      </div>

      <div className="card mb-5">
        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search by tenant or unit...">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="OVERDUE">Overdue</option>
            <option value="PARTIAL">Partial</option>
          </select>
        </SearchFilterBar>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" description="No payments match your current filters." />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3.5">Tenant</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden md:table-cell">Unit</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5">Amount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden sm:table-cell">Due</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden lg:table-cell">Paid</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50/80">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {p.tenant?.firstName?.[0]}{p.tenant?.lastName?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{fullName(p.tenant)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-sm text-slate-600">{p.lease?.unit?.name}</p>
                      <p className="text-xs text-slate-400">{p.lease?.unit?.property?.name}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(p.amount)}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <p className="text-sm text-slate-600">{formatDate(p.dueDate)}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <p className="text-sm text-slate-600">{p.paidDate ? formatDate(p.paidDate) : '—'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        {(p.status === 'PENDING' || p.status === 'OVERDUE') && (
                          <button
                            onClick={() => markPaid(p)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Mark paid"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit status modal */}
      <Modal open={!!editPayment} onClose={() => setEditPayment(null)} title="Update Payment">
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <div>
            <label className="label">Status</label>
            <select className="input" {...register('status')}>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PARTIAL">Partial</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Date</label>
            <input type="date" className="input" {...register('paidDate')} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={() => setEditPayment(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add payment modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Record Payment">
        <form onSubmit={handleAdd(onAddSubmit)} className="space-y-4">
          <div>
            <label className="label">Tenant</label>
            <select className="input" {...regAdd('tenantId', { required: true })}>
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{fullName(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Lease</label>
            <select className="input" {...regAdd('leaseId', { required: true })}>
              <option value="">Select lease...</option>
              {leases.filter((l) => l.status === 'ACTIVE').map((l) => (
                <option key={l.id} value={l.id}>{fullName(l.tenant)} – {l.unit?.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount ($)</label>
              <input type="number" className="input" {...regAdd('amount', { required: true, min: 1 })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" {...regAdd('status')}>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PARTIAL">Partial</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" {...regAdd('dueDate', { required: true })} />
            </div>
            <div>
              <label className="label">Paid Date</label>
              <input type="date" className="input" {...regAdd('paidDate')} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" placeholder="e.g. April 2025 rent" {...regAdd('description')} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isAdding}>
              {isAdding ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PaymentsPage;
