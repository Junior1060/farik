import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, CreditCard, MessageSquare,
  Bell, Wrench, LogOut, X, Building2, Bot, GitBranch, Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAutopilot } from '../../context/AutopilotContext';
import { getInitials } from '../../utils/formatters';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/properties', icon: Building2, label: 'Properties' },
  { to: '/tenants', icon: Users, label: 'Tenants' },
  { to: '/leases', icon: FileText, label: 'Leases' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/notices', icon: Bell, label: 'Notices' },
  { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/agent', icon: Bot, label: 'AI Manager' },
  { to: '/timeline', icon: GitBranch, label: 'Autopilot' },
  { to: '/import', icon: Upload, label: 'Import' },
];

const Sidebar = ({ open, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const autopilot = useAutopilot();
  const profile = user?.profile;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-56 bg-white z-40 flex flex-col
        transform transition-transform duration-200 ease-in-out
        border-r border-slate-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <Building2 size={15} className="text-white" />
            </div>
            <span className="text-slate-900 font-bold text-base tracking-tight">Farik</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isAgent = to === '/agent';
            const badgeCount = isAgent ? (autopilot?.escalatedCount || 0) : 0;
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={16}
                      className={
                        isActive
                          ? 'text-indigo-600'
                          : 'text-slate-400 group-hover:text-slate-600 transition-colors'
                      }
                    />
                    <span className="flex-1">{label}</span>
                    {badgeCount > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 bg-indigo-600 text-white">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-slate-100 flex-shrink-0">
          <NavLink
            to="/profile"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`
            }
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {getInitials(profile?.firstName, profile?.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-900 text-sm font-semibold truncate leading-tight">
                {profile?.firstName} {profile?.lastName}
              </p>
              <p className="text-slate-400 text-xs truncate">{user?.email}</p>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            className="mt-1 flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm font-medium w-full"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
