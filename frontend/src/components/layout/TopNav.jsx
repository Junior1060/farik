import React, { useState, useRef, useEffect } from 'react';
import { Menu, Bell, Bot, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAutopilot } from '../../context/AutopilotContext';
import { markNotificationsRead } from '../../services/agentService';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/properties': 'Properties',
  '/tenants': 'Tenants',
  '/leases': 'Leases',
  '/payments': 'Payments',
  '/messages': 'Messages',
  '/notices': 'Notices',
  '/maintenance': 'Maintenance',
  '/agent': 'AI Manager',
  '/timeline': 'Autopilot Timeline',
  '/profile': 'Profile',
};

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const TopNav = ({ onMenuClick }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const autopilot = useAutopilot();
  const title = pageTitles[pathname] || 'Farik';

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBellOpen = async () => {
    setBellOpen((v) => !v);
    if (!bellOpen && autopilot?.unreadCount > 0) {
      try { await markNotificationsRead(); autopilot.refresh(); } catch { /* silent */ }
    }
  };

  const notifications = autopilot?.notifications || [];

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Autopilot pill */}
        {autopilot && (
          <button
            onClick={autopilot.toggle}
            title={autopilot.isEnabled ? 'Autopilot On' : 'Autopilot Off'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
              autopilot.isEnabled
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100'
                : 'bg-slate-100 text-slate-500 border border-transparent hover:bg-slate-200'
            }`}
          >
            <Bot size={14} />
            <span className="hidden sm:inline">Autopilot</span>
            <span className={`w-1.5 h-1.5 rounded-full ${
              autopilot.isEnabled ? 'bg-indigo-500' : 'bg-slate-400'
            }`} />
          </button>
        )}

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={handleBellOpen}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Bell size={18} />
            {autopilot?.unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {autopilot.unreadCount > 9 ? '9+' : autopilot.unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-card-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                <button
                  onClick={() => { setBellOpen(false); navigate('/agent'); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View all
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <CheckCircle2 size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-500">All caught up</p>
                  <p className="text-xs text-slate-400 mt-1">No new notifications</p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {notifications.slice(0, 8).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { setBellOpen(false); navigate('/agent'); }}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors"
                    >
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        n.read ? 'bg-slate-100' : 'bg-indigo-50'
                      }`}>
                        <AlertTriangle size={12} className={n.read ? 'text-slate-400' : 'text-indigo-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${n.read ? 'text-slate-500' : 'text-slate-900'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{n.body}</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {autopilot?.escalatedCount > 0 && (
                <div className="px-4 py-3 border-t border-slate-100 bg-amber-50">
                  <button
                    onClick={() => { setBellOpen(false); navigate('/agent'); }}
                    className="w-full flex items-center justify-between text-xs font-semibold text-amber-700 hover:text-amber-800"
                  >
                    <span>
                      {autopilot.escalatedCount} action{autopilot.escalatedCount !== 1 ? 's' : ''} need your approval
                    </span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNav;
