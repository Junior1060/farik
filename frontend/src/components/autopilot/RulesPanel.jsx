import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Info, Wrench, ChevronDown } from 'lucide-react';
import InfoBanner from '../ui/InfoBanner';
import LoadingSpinner from '../ui/LoadingSpinner';
import Tabs from '../ui/Tabs';
import RuleRow, { LockedRuleRow } from './RuleRow';
import TrustLevelSelector from '../agent/TrustLevelSelector';
import PolicyOverrideTable from '../agent/PolicyOverrideTable';
import VendorsPanel from './VendorsPanel';
import { ENFORCED_RULES, STORED_ONLY_RULES, LOCKED_RULES, TRUST_DOMAINS, coerceRuleValue } from './ruleMap';
import { getOrgPolicies, updateOrgPolicy } from '../../services/policyApi';
import { getAgentConfig, updateAgentConfig } from '../../services/agentService';

function Section({ title, description, children, tone }) {
  return (
    <section className="card p-0 overflow-hidden" aria-label={title}>
      <div className={`px-5 py-4 border-b border-slate-100 ${tone === 'muted' ? 'bg-surface-50' : ''}`}>
        <h3 className="section-title">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="divide-y divide-slate-50 p-2">{children}</div>
    </section>
  );
}

export default function RulesPanel({ messagingConfigured = false }) {
  const [policies, setPolicies] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [trustDomain, setTrustDomain] = useState('MAINTENANCE');
  const [vendorsOpen, setVendorsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pol, cfg] = await Promise.all([getOrgPolicies(), getAgentConfig()]);
      setPolicies(pol);
      setConfig(cfg);
    } catch {
      setError('Could not load your Autopilot rules. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const valueFor = (rule) =>
    rule.target === 'agentConfig'
      ? config?.[rule.key]
      : policies[rule.domain]?.settings?.[rule.key];

  const handleChange = async (rule, raw) => {
    const value = coerceRuleValue(rule, raw);
    setSaving(rule.id);
    setError('');

    if (rule.target === 'agentConfig') {
      const previous = config;
      setConfig((c) => ({ ...c, [rule.key]: value }));
      try {
        setConfig(await updateAgentConfig({ [rule.key]: value }));
      } catch {
        setConfig(previous);
        setError('That change could not be saved.');
      } finally {
        setSaving(null);
      }
      return;
    }

    const previous = policies;
    setPolicies((p) => ({
      ...p,
      [rule.domain]: { ...p[rule.domain], settings: { ...p[rule.domain]?.settings, [rule.key]: value } },
    }));
    try {
      await updateOrgPolicy(rule.domain, { settings: { [rule.key]: value } });
    } catch {
      setPolicies(previous);
      setError('That change could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  const handleTrustChange = async (domain, trustLevel) => {
    const previous = policies;
    setSaving(domain);
    setPolicies((p) => ({ ...p, [domain]: { ...p[domain], trustLevel, source: 'org_default' } }));
    try {
      await updateOrgPolicy(domain, { trustLevel });
    } catch {
      setPolicies(previous);
      setError('That change could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>;

  const activeTrustDomain = TRUST_DOMAINS.find((d) => d.id === trustDomain);

  return (
    <div className="space-y-5">
      {error && <InfoBanner variant="danger">{error}</InfoBanner>}

      <Section
        title="Active rules"
        description="Farik follows these today. Anything outside them is sent to Needs approval."
      >
        {ENFORCED_RULES.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            value={valueFor(rule)}
            disabled={saving === rule.id}
            onChange={(v) => handleChange(rule, v)}
          />
        ))}
      </Section>

      {/* Trust levels */}
      <section className="card" aria-labelledby="trust-heading">
        <h3 id="trust-heading" className="section-title">How far Farik may go</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
          The trust level for an area decides whether Farik only watches, drafts for you, or acts within your rules.
        </p>
        <Tabs
          tabs={TRUST_DOMAINS.map((d) => ({ id: d.id, label: d.label }))}
          value={trustDomain}
          onChange={setTrustDomain}
          ariaLabel="Policy areas"
          className="mb-4"
        />
        {!activeTrustDomain?.enforced && (
          <InfoBanner variant="info" className="mb-4">
            Farik saves this preference but does not act on it yet.
          </InfoBanner>
        )}
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Account-wide default</h4>
            <TrustLevelSelector
              value={policies[trustDomain]?.trustLevel}
              disabled={saving === trustDomain}
              onChange={(level) => handleTrustChange(trustDomain, level)}
            />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Per-property overrides</h4>
            <p className="text-xs text-slate-500 mb-3">A property override always wins over the account-wide default.</p>
            <PolicyOverrideTable domain={trustDomain} />
          </div>
        </div>
      </section>

      <Section
        title="Saved preferences — not yet enforced"
        description="Farik stores these but does not act on them yet. They are shown so your settings survive the integrations landing."
        tone="muted"
      >
        {STORED_ONLY_RULES.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            value={valueFor(rule)}
            disabled={saving === rule.id}
            onChange={(v) => handleChange(rule, v)}
            note={
              rule.id === 'smsEnabled' && !messagingConfigured
                ? 'Messaging number not configured for this deployment.'
                : undefined
            }
          />
        ))}
      </Section>

      <Section
        title="Always required, whatever the settings say"
        description="These cannot be switched off."
      >
        {LOCKED_RULES.map((rule) => <LockedRuleRow key={rule.id} rule={rule} />)}
      </Section>

      {/* Vendors — which contractors Autopilot may dispatch */}
      <section className="card p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setVendorsOpen((v) => !v)}
          aria-expanded={vendorsOpen}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        >
          <Wrench size={16} className="text-slate-500 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block section-title">Vendors Farik can dispatch</span>
            <span className="block text-xs text-slate-500 mt-0.5">Matched to maintenance requests by specialty.</span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`ml-auto text-slate-500 flex-shrink-0 transition-transform ${vendorsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {vendorsOpen && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-5">
            <VendorsPanel />
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-slate-500 px-1">
        <Info size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        Changes apply to future actions. Anything already waiting in Needs approval stays there until you decide.
      </p>
      <p className="flex items-start gap-2 text-xs text-slate-500 px-1">
        <ShieldCheck size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        Farik prepares drafts from your data and does not provide legal advice.
      </p>
    </div>
  );
}
