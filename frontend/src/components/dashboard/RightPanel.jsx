import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { getInitials, formatCurrency } from '../../utils/formatters';
import ActivityFeed from './ActivityFeed';
import { Building2, AlertTriangle } from 'lucide-react';

const RightPanel = ({ stats, activity, expiringLeases }) => {
  const { user } = useAuth();
  const profile = user?.profile;

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-4">
      {/* Profile card */}
      <div className="card">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-3 shadow-sm">
            {getInitials(profile?.firstName, profile?.lastName)}
          </div>
          <p className="font-semibold text-slate-900">{profile?.firstName} {profile?.lastName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{profile?.companyName || 'Landlord'}</p>
          <div className="mt-4 w-full pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-slate-900">{stats?.totalUnits || 0}</p>
              <p className="text-xs text-slate-400">Total Units</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats?.occupancyRate || 0}%</p>
              <p className="text-xs text-slate-400">Occupancy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio summary */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={14} className="text-slate-400" />
          <h3 className="section-title">Portfolio Summary</h3>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Occupied</span>
            <span className="font-semibold text-slate-800">{stats?.occupiedUnits || 0} units</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Vacant</span>
            <span className="font-semibold text-slate-800">{stats?.vacantUnits || 0} units</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Monthly Revenue</span>
            <span className="font-semibold text-emerald-600">{formatCurrency(stats?.monthlyRentTotal || 0)}</span>
          </div>
        </div>
        {stats?.occupancyRate !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Occupancy rate</span>
              <span className="font-semibold text-slate-600">{stats.occupancyRate}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.occupancyRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expiring leases alert */}
      {expiringLeases?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">Expiring Soon</h3>
          </div>
          <div className="space-y-2.5">
            {expiringLeases.slice(0, 3).map((lease) => (
              <div key={lease.id}>
                <p className="text-xs font-semibold text-amber-900">
                  {lease.tenant?.firstName} {lease.tenant?.lastName}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {lease.unit?.name} · {new Date(lease.endDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="card flex-1">
        <ActivityFeed activity={activity} />
      </div>
    </div>
  );
};

export default RightPanel;
