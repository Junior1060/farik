import React, { useEffect, useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { getProperties } from '../../services/propertyService';
import { getPropertyPolicies, updatePropertyPolicy, deletePropertyPolicy } from '../../services/policyApi';
import { TRUST_LEVELS } from './TrustLevelSelector';

const LEVEL_LABELS = Object.fromEntries(TRUST_LEVELS.map((l) => [l.value, l.label]));

export default function PolicyOverrideTable({ domain }) {
  const [properties, setProperties] = useState([]);
  const [policiesByProperty, setPoliciesByProperty] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { properties: props } = await getProperties();
      setProperties(props);
      const entries = await Promise.all(
        props.map(async (p) => [p.id, await getPropertyPolicies(p.id)]),
      );
      setPoliciesByProperty(Object.fromEntries(entries));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleChange = async (propertyId, trustLevel) => {
    setSavingId(propertyId);
    try {
      await updatePropertyPolicy(propertyId, domain, { trustLevel });
      const updated = await getPropertyPolicies(propertyId);
      setPoliciesByProperty((prev) => ({ ...prev, [propertyId]: updated }));
    } finally {
      setSavingId(null);
    }
  };

  const handleReset = async (propertyId) => {
    setSavingId(propertyId);
    try {
      await deletePropertyPolicy(propertyId, domain);
      const updated = await getPropertyPolicies(propertyId);
      setPoliciesByProperty((prev) => ({ ...prev, [propertyId]: updated }));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <p className="text-xs text-slate-400 py-4">Loading properties…</p>;
  if (properties.length === 0) return <p className="text-xs text-slate-400 py-4">Add a property to configure per-property overrides.</p>;

  return (
    <div className="space-y-2">
      {properties.map((property) => {
        const policy = policiesByProperty[property.id]?.[domain];
        const isOverride = policy?.source === 'property_override';
        return (
          <div key={property.id} className="flex items-center justify-between gap-3 p-3 border border-slate-100 rounded-xl">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{property.name}</p>
              <p className="text-xs text-slate-400">
                {isOverride ? 'Property override' : 'Inherits org default'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={policy?.trustLevel || ''}
                disabled={savingId === property.id}
                onChange={(e) => handleChange(property.id, e.target.value)}
              >
                {TRUST_LEVELS.map((l) => <option key={l.value} value={l.value}>{LEVEL_LABELS[l.value]}</option>)}
              </select>
              {isOverride && (
                <button
                  type="button"
                  title="Revert to org default"
                  disabled={savingId === property.id}
                  onClick={() => handleReset(property.id)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
