import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchFilterBar from '../components/ui/SearchFilterBar';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import useFetch from '../hooks/useFetch';
import { getMaintenanceRequests, updateMaintenanceRequest } from '../services/maintenanceService';
import { assetUrl } from '../services/api';
import { formatDate, formatRelative, fullName } from '../utils/formatters';

const statusOptions = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

const MaintenancePage = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const { data, loading, error, refetch } = useFetch(getMaintenanceRequests);
  const requests = data?.requests || [];

  const filtered = requests.filter((r) => {
    const name = fullName(r.tenant).toLowerCase();
    const title = r.title.toLowerCase();
    const unit = r.unit?.name?.toLowerCase() || '';
    const q = search.toLowerCase();
    const matchSearch = name.includes(q) || title.includes(q) || unit.includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchPriority = !priorityFilter || r.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const updateStatus = async (id, status) => {
    await updateMaintenanceRequest(id, { status });
    refetch();
  };

  const openCount = requests.filter((r) => r.status === 'OPEN').length;
  const inProgressCount = requests.filter((r) => r.status === 'IN_PROGRESS').length;

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description={`${openCount} open · ${inProgressCount} in progress`}
      />

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Open', count: openCount, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: 'In Progress', count: inProgressCount, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
          { label: 'Resolved', count: requests.filter((r) => r.status === 'RESOLVED').length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card mb-5">
        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search by tenant, unit, or issue...">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input w-auto">
            <option value="">All Priority</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </SearchFilterBar>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="No maintenance requests" description="No requests match your current filters." />
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <div key={req.id} className="card">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  req.priority === 'HIGH' ? 'bg-red-50' : req.priority === 'MEDIUM' ? 'bg-amber-50' : 'bg-slate-100'
                }`}>
                  <Wrench size={18} className={
                    req.priority === 'HIGH' ? 'text-red-600' : req.priority === 'MEDIUM' ? 'text-amber-600' : 'text-slate-500'
                  } />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/maintenance/${req.id}`} className="font-semibold text-slate-800 hover:text-brand-600 hover:underline flex items-center gap-1">
                          {req.title} <ChevronRight size={14} className="text-slate-400" />
                        </Link>
                        <PriorityBadge priority={req.priority} />
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {fullName(req.tenant)} · {req.unit?.name} · {req.unit?.property?.name}
                      </p>
                    </div>

                    {/* Status dropdown */}
                    {req.status !== 'RESOLVED' && (
                      <div className="flex-shrink-0">
                        <select
                          value={req.status}
                          onChange={(e) => updateStatus(req.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{req.description}</p>

                  {req.photos?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {req.photos.map((src, i) => (
                        <a key={i} href={assetUrl(src)} target="_blank" rel="noreferrer">
                          <img
                            src={assetUrl(src)}
                            alt={`Photo ${i + 1}`}
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-2">
                    <p className="text-xs text-slate-400">Submitted {formatRelative(req.createdAt)}</p>
                    {req.resolvedAt && (
                      <p className="text-xs text-emerald-600">Resolved {formatDate(req.resolvedAt)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaintenancePage;
