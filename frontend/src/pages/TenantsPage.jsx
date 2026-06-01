import React, { useState } from 'react';
import { Users, Plus, Edit, Trash2, Eye, Phone, Mail } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchFilterBar from '../components/ui/SearchFilterBar';
import PaymentStatusBadge from '../components/ui/PaymentStatusBadge';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import useFetch from '../hooks/useFetch';
import { getTenants, updateTenant, deleteTenant } from '../services/tenantService';
import { formatDate, fullName } from '../utils/formatters';
import { useForm } from 'react-hook-form';

const TenantsPage = () => {
  const [search, setSearch] = useState('');
  const [editTenant, setEditTenant] = useState(null);
  const [viewTenant, setViewTenant] = useState(null);

  const { data, loading, error, refetch } = useFetch(getTenants);
  const tenants = data?.tenants || [];

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const filtered = tenants.filter((t) => {
    const name = `${t.firstName} ${t.lastName}`.toLowerCase();
    const email = t.user?.email?.toLowerCase() || '';
    const unit = t.leases?.[0]?.unit?.name?.toLowerCase() || '';
    const q = search.toLowerCase();
    return name.includes(q) || email.includes(q) || unit.includes(q);
  });

  const openEdit = (tenant) => {
    setEditTenant(tenant);
    reset({ firstName: tenant.firstName, lastName: tenant.lastName, phone: tenant.phone || '' });
  };

  const onEditSubmit = async (values) => {
    await updateTenant(editTenant.id, values);
    setEditTenant(null);
    refetch();
  };

  const onDelete = async (id) => {
    if (!confirm('Remove this tenant and all related data?')) return;
    await deleteTenant(id);
    refetch();
  };

  const getPaymentStatus = (tenant) => {
    const p = tenant.payments?.[0];
    return p?.status || 'PENDING';
  };

  const getLastLease = (tenant) => tenant.leases?.[0];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Tenants"
        description={`${tenants.length} total tenants`}
      />

      <div className="card mb-5">
        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search by name, email, unit..." />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No tenants found" description="No tenants match your search criteria." />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3.5">Tenant</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden md:table-cell">Contact</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden lg:table-cell">Unit</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5 hidden lg:table-cell">Lease</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((tenant) => {
                  const lease = getLastLease(tenant);
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {tenant.firstName[0]}{tenant.lastName[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{fullName(tenant)}</p>
                            <p className="text-xs text-slate-400">{tenant.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Mail size={11} />
                            {tenant.user?.email}
                          </div>
                          {tenant.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Phone size={11} />
                              {tenant.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        {lease ? (
                          <div>
                            <p className="text-sm font-medium text-slate-800">{lease.unit?.name}</p>
                            <p className="text-xs text-slate-400">{lease.unit?.property?.name}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">No active unit</span>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        {lease ? (
                          <div>
                            <p className="text-xs text-slate-500">{formatDate(lease.startDate)}</p>
                            <p className="text-xs text-slate-500">{formatDate(lease.endDate)}</p>
                            <StatusBadge status={lease.status} className="mt-1" />
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <PaymentStatusBadge status={getPaymentStatus(tenant)} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setViewTenant(tenant)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-surface-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => openEdit(tenant)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            onClick={() => onDelete(tenant.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editTenant} onClose={() => setEditTenant(null)} title="Edit Tenant">
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input className="input" {...register('firstName', { required: true })} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" {...register('lastName', { required: true })} />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" placeholder="(555) 000-0000" {...register('phone')} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={() => setEditTenant(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTenant} onClose={() => setViewTenant(null)} title="Tenant Details" size="lg">
        {viewTenant && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center text-xl font-bold">
                {viewTenant.firstName[0]}{viewTenant.lastName[0]}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{fullName(viewTenant)}</h3>
                <p className="text-slate-500 text-sm">{viewTenant.user?.email}</p>
                {viewTenant.phone && <p className="text-slate-500 text-sm">{viewTenant.phone}</p>}
              </div>
            </div>
            {viewTenant.leases?.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Current Lease</p>
                {viewTenant.leases.slice(0, 1).map((lease) => (
                  <div key={lease.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Unit</span>
                      <span className="font-medium text-slate-800">{lease.unit?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Rent</span>
                      <span className="font-medium text-slate-800">${lease.monthlyRent}/mo</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Period</span>
                      <span className="font-medium text-slate-800">{formatDate(lease.startDate)} – {formatDate(lease.endDate)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Status</span>
                      <StatusBadge status={lease.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TenantsPage;
