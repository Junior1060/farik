import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Phone, Mail, Wrench } from 'lucide-react';
import Modal from '../ui/Modal';
import Switch from '../ui/Switch';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoBanner from '../ui/InfoBanner';
import { getVendors, createVendor, updateVendor, deleteVendor } from '../../services/agentService';

const SPECIALTIES = ['plumbing', 'electrical', 'hvac', 'structural', 'appliance', 'general'];
const emptyVendor = { name: '', phone: '', email: '', specialty: 'general', notes: '', isActive: true };

export default function VendorsPanel() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | vendor
  const [form, setForm] = useState(emptyVendor);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVendors(await getVendors());
    } catch {
      setError('Could not load vendors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        const v = await createVendor(form);
        setVendors((prev) => [v, ...prev]);
      } else {
        const v = await updateVendor(modal.id, form);
        setVendors((prev) => prev.map((x) => (x.id === modal.id ? v : x)));
      }
      setModal(null);
    } catch {
      setError('Could not save that vendor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Remove this vendor? Farik will stop assigning them new jobs.')) return;
    try {
      await deleteVendor(id);
      setVendors((prev) => prev.filter((v) => v.id !== id));
    } catch {
      setError('Could not remove that vendor.');
    }
  };

  if (loading) return <div className="py-10 flex justify-center"><LoadingSpinner /></div>;

  const field = (label, key, props = {}) => (
    <div>
      <label className="label" htmlFor={`vendor-${key}`}>{label}</label>
      <input
        id={`vendor-${key}`}
        className="input"
        value={form[key] ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        {...props}
      />
    </div>
  );

  return (
    <div>
      {error && <InfoBanner variant="danger" className="mb-4">{error}</InfoBanner>}

      <div className="flex justify-end mb-4">
        <button
          type="button"
          className="btn-primary"
          onClick={() => { setForm(emptyVendor); setModal('add'); }}
        >
          <Plus size={15} aria-hidden="true" /> Add vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-slate-200 rounded-2xl">
          <Wrench size={30} className="text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-600 font-medium">No vendors yet</p>
          <p className="text-sm text-slate-500 mt-1">Add vendors so Farik can match maintenance jobs by specialty.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {vendors.map((v) => (
            <li key={v.id} className="border border-slate-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-slate-800 truncate">{v.name}</h4>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full capitalize">{v.specialty}</span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    aria-label={`Edit ${v.name}`}
                    onClick={() => { setForm(v); setModal(v); }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${v.name}`}
                    onClick={() => handleDelete(v.id)}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={13} className="text-slate-500" aria-hidden="true" /> {v.phone}
              </p>
              {v.email && (
                <p className="flex items-center gap-2 text-sm text-slate-600 mt-1.5">
                  <Mail size={13} className="text-slate-500" aria-hidden="true" /> {v.email}
                </p>
              )}
              {v.notes && <p className="text-xs text-slate-500 mt-2">{v.notes}</p>}
              {!v.isActive && (
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                  Inactive — Farik will skip this vendor
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <Modal open onClose={() => setModal(null)} title={modal === 'add' ? 'Add vendor' : 'Edit vendor'}>
          <div className="space-y-4">
            {field('Name', 'name', { placeholder: 'ABC Plumbing', required: true })}
            <div>
              <label className="label" htmlFor="vendor-specialty">Specialty</label>
              <select
                id="vendor-specialty"
                className="input capitalize"
                value={form.specialty}
                onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
              >
                {SPECIALTIES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            {field('Phone', 'phone', { placeholder: '(306) 555-0100', required: true })}
            {field('Email', 'email', { type: 'email', placeholder: 'vendor@example.com' })}
            <div>
              <label className="label" htmlFor="vendor-notes">Notes</label>
              <textarea
                id="vendor-notes"
                rows={2}
                className="input resize-none"
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Available 24/7, bilingual…"
              />
            </div>
            <Switch
              checked={form.isActive !== false}
              onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              label="Active"
              description="Farik may assign this vendor to new jobs."
            />
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name || !form.phone}
              >
                {saving ? 'Saving…' : 'Save vendor'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
