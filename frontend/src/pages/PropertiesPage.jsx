import React, { useState } from 'react';
import { Building2, Plus, Edit, Trash2, Home, X, Check } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Modal from '../components/ui/Modal';
import useFetch from '../hooks/useFetch';
import {
  getProperties, createProperty, updateProperty, deleteProperty,
  createUnit, updateUnit, deleteUnit,
} from '../services/propertyService';
import { useForm } from 'react-hook-form';

const PropertiesPage = () => {
  const { data, loading, error, refetch } = useFetch(getProperties);
  const properties = data?.properties || [];

  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [editProperty, setEditProperty] = useState(null);

  const propForm = useForm();

  const onAddProperty = async (values) => {
    await createProperty(values);
    setAddPropertyOpen(false);
    propForm.reset();
    refetch();
  };

  const onEditProperty = async (values) => {
    await updateProperty(editProperty.id, values);
    setEditProperty(null);
    refetch();
  };

  const onDeleteProperty = async (id) => {
    if (!confirm('Delete this property and all its units?')) return;
    await deleteProperty(id);
    refetch();
  };

  const openEditProperty = (property) => {
    setEditProperty(property);
    propForm.reset({
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      description: property.description || '',
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  return (
    <div>
      <PageHeader
        title="Properties"
        description={`${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`}
        action={
          <button className="btn-primary" onClick={() => { propForm.reset(); setAddPropertyOpen(true); }}>
            <Plus size={16} /> Add property
          </button>
        }
      />

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>}

      {properties.length === 0 ? (
        <EmptyState icon={Building2} title="No properties yet" description="Add your first property to get started." />
      ) : (
        <div className="space-y-5">
          {properties.map((property) => {
            const occupied = property.units.filter((u) => u.isOccupied).length;
            const vacant = property.units.length - occupied;
            return (
              <div key={property.id} className="card p-0 overflow-hidden">
                {/* Property header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{property.name}</p>
                      <p className="text-xs text-slate-400">{property.address}, {property.city}, {property.state} {property.zip}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-3 text-xs">
                      <span className="text-slate-500">{property.units.length} units</span>
                      <span className="text-green-600 font-medium">{vacant} vacant</span>
                      <span className="text-red-500 font-medium">{occupied} occupied</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditProperty(property)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit property">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => onDeleteProperty(property.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete property">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Units section */}
                <UnitsSection property={property} onRefetch={refetch} />
              </div>
            );
          })}
        </div>
      )}

      {/* Add Property Modal */}
      <Modal open={addPropertyOpen} onClose={() => setAddPropertyOpen(false)} title="Add property">
        <PropertyForm form={propForm} onSubmit={onAddProperty} onCancel={() => setAddPropertyOpen(false)} />
      </Modal>

      {/* Edit Property Modal */}
      <Modal open={!!editProperty} onClose={() => setEditProperty(null)} title="Edit property" size="lg">
        <div className="space-y-6">
          <PropertyForm form={propForm} onSubmit={onEditProperty} onCancel={() => setEditProperty(null)} submitLabel="Save changes" />
          {editProperty && (
            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Units</p>
              <UnitsSection property={editProperty} onRefetch={() => {
                // refresh the editProperty units in place
                getProperties().then((d) => {
                  const updated = d.properties.find((p) => p.id === editProperty.id);
                  if (updated) setEditProperty(updated);
                  refetch();
                });
              }} compact />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

/* ── Units section (used both in card and in edit modal) ── */
const UnitsSection = ({ property, onRefetch, compact = false }) => {
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const onAddUnit = async (values) => {
    await createUnit(property.id, {
      name: values.name,
      bedrooms: Number(values.bedrooms ?? 1),
      bathrooms: Number(values.bathrooms ?? 1),
      sqft: values.sqft ? Number(values.sqft) : null,
      rentAmount: Number(values.rentAmount),
    });
    reset();
    setAddingUnit(false);
    onRefetch();
  };

  const onEditUnit = async (values) => {
    await updateUnit(property.id, editingUnit.id, {
      name: values.name,
      bedrooms: Number(values.bedrooms ?? 1),
      bathrooms: Number(values.bathrooms ?? 1),
      sqft: values.sqft ? Number(values.sqft) : null,
      rentAmount: Number(values.rentAmount),
    });
    setEditingUnit(null);
    onRefetch();
  };

  const onDeleteUnit = async (unitId) => {
    if (!confirm('Delete this unit?')) return;
    await deleteUnit(property.id, unitId);
    onRefetch();
  };

  const startEdit = (unit) => {
    setEditingUnit(unit);
    reset({ name: unit.name, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, sqft: unit.sqft || '', rentAmount: unit.rentAmount });
  };

  return (
    <div className={compact ? '' : 'px-6 py-4'}>
      {!compact && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Units</p>
          {!addingUnit && (
            <button className="btn-secondary text-xs" onClick={() => { reset({ bedrooms: 1, bathrooms: 1 }); setAddingUnit(true); }}>
              <Plus size={13} /> Add unit
            </button>
          )}
        </div>
      )}

      {/* Unit list */}
      <div className="space-y-2">
        {property.units.length === 0 && !addingUnit && (
          <p className="text-sm text-slate-400 py-1">No units yet.</p>
        )}

        {property.units.map((unit) => (
          <div key={unit.id}>
            {editingUnit?.id === unit.id ? (
              /* Inline edit row */
              <form onSubmit={handleSubmit(onEditUnit)} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Unit name</label>
                    <input className="input text-sm" placeholder="Apt 3C" {...register('name', { required: true })} />
                  </div>
                  <div>
                    <label className="label text-xs">Monthly rent ($)</label>
                    <input type="number" min="1" className="input text-sm" {...register('rentAmount', { required: true })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label text-xs">Bedrooms</label>
                    <input type="number" min="0" className="input text-sm" {...register('bedrooms')} />
                  </div>
                  <div>
                    <label className="label text-xs">Bathrooms</label>
                    <input type="number" min="0" step="0.5" className="input text-sm" {...register('bathrooms')} />
                  </div>
                  <div>
                    <label className="label text-xs">Sqft</label>
                    <input type="number" min="0" className="input text-sm" {...register('sqft')} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setEditingUnit(null)}><X size={13} /> Cancel</button>
                  <button type="submit" className="btn-primary text-xs" disabled={isSubmitting}><Check size={13} /> Save</button>
                </div>
              </form>
            ) : (
              /* Unit display row */
              <div className="flex items-center justify-between bg-surface-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <Home size={14} className="text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{unit.name}</p>
                    <p className="text-xs text-slate-400">
                      {unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms} bed`} · {unit.bathrooms} bath
                      {unit.sqft ? ` · ${unit.sqft.toLocaleString()} sqft` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">${unit.rentAmount.toLocaleString()}<span className="font-normal text-slate-400 text-xs">/mo</span></p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${unit.isOccupied ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {unit.isOccupied ? 'Occupied' : 'Vacant'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(unit)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit size={14} /></button>
                    <button onClick={() => onDeleteUnit(unit.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add unit inline form */}
        {addingUnit && (
          <form onSubmit={handleSubmit(onAddUnit)} className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-green-700 mb-1">New unit</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label text-xs">Unit name *</label>
                <input className="input text-sm" placeholder="e.g. Apt 10, Studio A, Unit 3C" {...register('name', { required: true })} />
              </div>
              <div>
                <label className="label text-xs">Monthly rent ($) *</label>
                <input type="number" min="1" className="input text-sm" placeholder="1200" {...register('rentAmount', { required: true })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label text-xs">Bedrooms (0 = Studio)</label>
                <input type="number" min="0" className="input text-sm" defaultValue={1} {...register('bedrooms')} />
              </div>
              <div>
                <label className="label text-xs">Bathrooms</label>
                <input type="number" min="0" step="0.5" className="input text-sm" defaultValue={1} {...register('bathrooms')} />
              </div>
              <div>
                <label className="label text-xs">Sqft (optional)</label>
                <input type="number" min="0" className="input text-sm" {...register('sqft')} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-xs" onClick={() => setAddingUnit(false)}><X size={13} /> Cancel</button>
              <button type="submit" className="btn-primary text-xs" disabled={isSubmitting}><Check size={13} /> Add unit</button>
            </div>
          </form>
        )}
      </div>

      {/* Add unit button inside compact mode (edit modal) */}
      {compact && !addingUnit && (
        <button className="btn-secondary text-xs mt-3" onClick={() => { reset({ bedrooms: 1, bathrooms: 1 }); setAddingUnit(true); }}>
          <Plus size={13} /> Add unit
        </button>
      )}
    </div>
  );
};

/* ── Property form ── */
const PropertyForm = ({ form, onSubmit, onCancel, submitLabel = 'Add property' }) => {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = form;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Property name *</label>
        <input className="input" placeholder="Sunset Ridge Complex" {...register('name', { required: true })} />
      </div>
      <div>
        <label className="label">Address *</label>
        <input className="input" placeholder="123 Main St" {...register('address', { required: true })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="label">City *</label>
          <input className="input" placeholder="Regina" {...register('city', { required: true })} />
        </div>
        <div>
          <label className="label">Province *</label>
          <input className="input" placeholder="SK" {...register('state', { required: true })} />
        </div>
        <div>
          <label className="label">Postal code *</label>
          <input className="input" placeholder="S4S 4H4" {...register('zip', { required: true })} />
        </div>
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <textarea rows={2} className="input resize-none" {...register('description')} />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default PropertiesPage;
