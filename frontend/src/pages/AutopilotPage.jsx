import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Play, RefreshCw, Activity, ShieldCheck, SlidersHorizontal, BarChart3 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Tabs, { TabPanel } from '../components/ui/Tabs';
import InfoBanner from '../components/ui/InfoBanner';
import ActivityPanel from '../components/autopilot/ActivityPanel';
import ApprovalsPanel from '../components/autopilot/ApprovalsPanel';
import RulesPanel from '../components/autopilot/RulesPanel';
import PerformancePanel from '../components/autopilot/PerformancePanel';
import { useAutopilot } from '../context/AutopilotContext';
import { triggerAgentRun } from '../services/agentService';
import { getMessagingConfig } from '../services/profileService';

const TAB_IDS = ['activity', 'approvals', 'rules', 'performance'];

export default function AutopilotPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const autopilot = useAutopilot();
  const [triggering, setTriggering] = useState(false);
  const [messagingNumber, setMessagingNumber] = useState(null);
  const [approvalCount, setApprovalCount] = useState(autopilot?.escalatedCount ?? 0);

  const requested = searchParams.get('tab');
  const tab = TAB_IDS.includes(requested) ? requested : 'activity';

  useEffect(() => {
    setApprovalCount(autopilot?.escalatedCount ?? 0);
  }, [autopilot?.escalatedCount]);

  useEffect(() => {
    let cancelled = false;
    getMessagingConfig()
      .then((d) => { if (!cancelled) setMessagingNumber(d?.messagingNumber ?? null); })
      .catch(() => { /* leave unconfigured */ });
    return () => { cancelled = true; };
  }, []);

  const setTab = (id) => setSearchParams(id === 'activity' ? {} : { tab: id }, { replace: true });

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerAgentRun();
      setTimeout(() => autopilot?.refresh?.(), 2000);
    } finally {
      setTriggering(false);
    }
  };

  const tabs = [
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'approvals', label: 'Needs approval', icon: ShieldCheck, count: approvalCount },
    { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
  ];

  const enabled = autopilot?.isEnabled;

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Autopilot"
        description="What Farik handled, what needs you, and the rules it follows."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTrigger}
              disabled={triggering}
              className="btn-secondary"
            >
              {triggering
                ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                : <Play size={15} aria-hidden="true" />}
              Run checks now
            </button>
            <button
              type="button"
              onClick={autopilot?.toggle}
              aria-pressed={!!enabled}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                enabled
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              <Bot size={15} aria-hidden="true" />
              {enabled ? 'Autopilot on' : 'Autopilot off'}
            </button>
          </div>
        }
      />

      {!enabled && autopilot?.loaded && (
        <InfoBanner variant="warning" className="mt-5">
          Autopilot is off. Farik will not act on rent, maintenance, or tenant messages until you turn it back on.
        </InfoBanner>
      )}

      <div className="mt-5 mb-5 overflow-x-auto">
        <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Autopilot sections" />
      </div>

      {tab === 'activity' && <TabPanel id="activity"><ActivityPanel /></TabPanel>}
      {tab === 'approvals' && (
        <TabPanel id="approvals"><ApprovalsPanel onCountChange={setApprovalCount} /></TabPanel>
      )}
      {tab === 'rules' && (
        <TabPanel id="rules"><RulesPanel messagingConfigured={!!messagingNumber} /></TabPanel>
      )}
      {tab === 'performance' && <TabPanel id="performance"><PerformancePanel /></TabPanel>}
    </div>
  );
}
