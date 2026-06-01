import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getAgentConfig, updateAgentConfig, getAgentLogs,
  getEscalations, getNotifications, approveLog, dismissLog,
} from '../services/agentService';
import { useAuth } from './AuthContext';

const AutopilotContext = createContext(null);

export function AutopilotProvider({ children }) {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(true);
  const [escalations, setEscalations] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'LANDLORD') return;
    try {
      const [cfg, logsData, escalationsData, notifData] = await Promise.all([
        getAgentConfig(),
        getAgentLogs({ limit: 20 }),
        getEscalations(),
        getNotifications(),
      ]);
      setIsEnabled(cfg.isEnabled);
      setRecentLogs(logsData.logs);
      setEscalations(escalationsData);
      setNotifications(notifData.notifications);
      setUnreadCount(notifData.unreadCount);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const toggle = async () => {
    const next = !isEnabled;
    setIsEnabled(next);
    try {
      await updateAgentConfig({ isEnabled: next });
    } catch {
      setIsEnabled(!next);
    }
  };

  const handleApprove = async (id) => {
    const log = await approveLog(id);
    setEscalations((prev) => prev.filter((e) => e.id !== id));
    setRecentLogs((prev) => prev.map((l) => (l.id === id ? log : l)));
  };

  const handleDismiss = async (id) => {
    const log = await dismissLog(id);
    setEscalations((prev) => prev.filter((e) => e.id !== id));
    setRecentLogs((prev) => prev.map((l) => (l.id === id ? log : l)));
  };

  const removeLog = (id) => setRecentLogs((prev) => prev.filter((l) => l.id !== id));

  const escalatedCount = escalations.length;
  const hasUrgent = escalations.some((e) => e.urgentAt !== null);

  const status = !loaded
    ? 'loading'
    : !isEnabled
    ? 'off'
    : hasUrgent
    ? 'red'
    : escalatedCount > 0
    ? 'yellow'
    : 'green';

  return (
    <AutopilotContext.Provider
      value={{
        isEnabled, toggle,
        escalations, escalatedCount, hasUrgent,
        recentLogs, removeLog,
        notifications, unreadCount,
        handleApprove, handleDismiss,
        status, loaded, refresh,
      }}
    >
      {children}
    </AutopilotContext.Provider>
  );
}

export const useAutopilot = () => useContext(AutopilotContext);
