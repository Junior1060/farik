import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import FormError from '../auth/FormError';
import { createTenant } from '../../services/tenantService';
import { createLease } from '../../services/leaseService';
import { describeAuthError } from '../../utils/authErrors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isoDate = (d) => d.toISOString().slice(0, 10);
const todayIso = () => isoDate(new Date());
const oneYearFromToday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};

const fullName = (t) => `${t.firstName} ${t.lastName}`.trim();

/**
 * One form for "put a tenant in a unit": either add a new tenant (POST /api/tenants,
 * which creates the tenant AND the lease) or pick an existing tenant and create
 * only the lease (POST /api/leases).
 *
 * Props:
 *  - properties: [{ id, name, units: [{ id, name, rentAmount, isOccupied }] }]
 *  - tenants: existing tenants for the "existing" mode (optional)
 *  - allowExistingTenant: show the new/existing switch (default false)
 *  - defaultPropertyId: preselect a property (e.g. the one just created in onboarding)
 *  - onSuccess({ tenant, lease }), onCancel (optional), submitLabel
 */
const TenantLeaseForm = ({
  properties = [],
  tenants = [],
  allowExistingTenant = false,
  defaultPropertyId,
  onSuccess,
  onCancel,
  submitLabel = 'Add tenant',
}) => {
  const [formError, setFormError] = useState('');
  const canPickExisting = allowExistingTenant && tenants.length > 0;
  const [mode, setMode] = useState(canPickExisting ? 'existing' : 'new');

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    mode: 'onTouched',
    defaultValues: {
      tenantId: tenants[0]?.id || '',
      propertyId: defaultPropertyId || properties[0]?.id || '',
      unitId: '',
      startDate: todayIso(),
      endDate: oneYearFromToday(),
      deposit: '',
      notes: '',
    },
  });

  const propertyId = watch('propertyId');
  const unitId = watch('unitId');

  const selectedProperty = useMemo(() => properties.find((p) => p.id === propertyId), [properties, propertyId]);
  const vacantUnits = useMemo(
    () => (selectedProperty?.units || []).filter((u) => !u.isOccupied),
    [selectedProperty],
  );

  // A property with exactly one vacant unit needs no choice — preselect it.
  useEffect(() => {
    if (vacantUnits.length === 1 && getValues('unitId') !== vacantUnits[0].id) {
      setValue('unitId', vacantUnits[0].id, { shouldValidate: false });
    } else if (vacantUnits.length !== 1 && getValues('unitId') && !vacantUnits.some((u) => u.id === getValues('unitId'))) {
      setValue('unitId', '');
    }
  }, [vacantUnits, getValues, setValue]);

  // Prefill the rent from the unit's listed rent when the landlord hasn't typed one.
  useEffect(() => {
    const unit = vacantUnits.find((u) => u.id === unitId);
    if (unit && unit.rentAmount > 0 && !getValues('monthlyRent')) {
      setValue('monthlyRent', String(unit.rentAmount));
    }
  }, [unitId, vacantUnits, getValues, setValue]);

  const onSubmit = async (values) => {
    if (isSubmitting) return;
    setFormError('');
    const lease = {
      unitId: values.unitId,
      startDate: values.startDate,
      endDate: values.endDate,
      monthlyRent: Number(values.monthlyRent),
      deposit: values.deposit === '' ? 0 : Number(values.deposit),
      notes: values.notes?.trim() || undefined,
    };
    try {
      if (mode === 'existing') {
        const tenant = tenants.find((t) => t.id === values.tenantId);
        const result = await createLease({ tenantId: values.tenantId, ...lease });
        onSuccess?.({ tenant, lease: result.lease });
      } else {
        const result = await createTenant({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          phone: values.phone?.trim() || undefined,
          ...lease,
        });
        onSuccess?.(result);
      }
    } catch (err) {
      setFormError(describeAuthError(err, 'form'));
    }
  };

  const invalidClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';
  const cls = (name) => `input ${errors[name] ? invalidClass : ''}`;
  const errId = (name) => (errors[name] ? `tenant-${name}-error` : undefined);
  const Err = ({ name }) => (errors[name]
    ? <p id={`tenant-${name}-error`} className="text-xs text-red-600 mt-1.5">{errors[name].message}</p>
    : null);

  if (properties.length === 0) {
    return (
      <div className="text-sm text-slate-600 leading-relaxed">
        <p>Add a property before adding tenants, so there is a unit to connect them to.</p>
        <Link to="/properties" className="btn-primary mt-4 inline-flex">Go to properties</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormError>{formError}</FormError>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tenant</legend>

        {canPickExisting && (
          <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50" role="radiogroup" aria-label="Tenant">
            {[['existing', 'Existing tenant'], ['new', 'New tenant']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  mode === value ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'existing' ? (
          <div>
            <label className="label" htmlFor="tenant-tenantId">Tenant</label>
            <select id="tenant-tenantId" className={cls('tenantId')} aria-invalid={!!errors.tenantId} aria-describedby={errId('tenantId')}
              {...register('tenantId', { required: 'Choose a tenant.' })}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{fullName(t)}{t.user?.email ? ` · ${t.user.email}` : ''}</option>)}
            </select>
            <Err name="tenantId" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="tenant-firstName">First name</label>
                <input id="tenant-firstName" autoComplete="off" className={cls('firstName')} aria-invalid={!!errors.firstName} aria-describedby={errId('firstName')} placeholder="Alice"
                  {...register('firstName', { validate: (v) => (v && v.trim().length > 0) || 'Enter a first name.' })} />
                <Err name="firstName" />
              </div>
              <div>
                <label className="label" htmlFor="tenant-lastName">Last name</label>
                <input id="tenant-lastName" autoComplete="off" className={cls('lastName')} aria-invalid={!!errors.lastName} aria-describedby={errId('lastName')} placeholder="Morgan"
                  {...register('lastName', { validate: (v) => (v && v.trim().length > 0) || 'Enter a last name.' })} />
                <Err name="lastName" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="tenant-email">Email</label>
                <input id="tenant-email" type="email" inputMode="email" autoComplete="off" className={cls('email')} aria-invalid={!!errors.email} aria-describedby={errId('email')} placeholder="alice@example.com"
                  {...register('email', { required: 'Enter an email address.', validate: (v) => EMAIL_PATTERN.test(v.trim()) || 'Enter a valid email address.' })} />
                <Err name="email" />
              </div>
              <div>
                <label className="label" htmlFor="tenant-phone">Mobile number <span className="text-slate-500 font-normal">(optional)</span></label>
                <input id="tenant-phone" type="tel" inputMode="tel" autoComplete="off" className="input" placeholder="(306) 555-0100" {...register('phone')} />
              </div>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="tenant-propertyId">Property</label>
            <select id="tenant-propertyId" className={cls('propertyId')} aria-invalid={!!errors.propertyId}
              {...register('propertyId', { required: 'Choose a property.' })}>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Err name="propertyId" />
          </div>
          <div>
            <label className="label" htmlFor="tenant-unitId">Unit</label>
            <select id="tenant-unitId" className={cls('unitId')} aria-invalid={!!errors.unitId} aria-describedby={errId('unitId')} disabled={vacantUnits.length === 0}
              {...register('unitId', { required: 'Choose a unit.' })}>
              <option value="">Select a unit</option>
              {vacantUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.rentAmount > 0 ? ` · $${u.rentAmount.toLocaleString()}/mo` : ''}
                </option>
              ))}
            </select>
            <Err name="unitId" />
            {selectedProperty && vacantUnits.length === 0 && (
              <p className="text-xs text-amber-700 mt-1.5">
                Every unit at this property is occupied.{' '}
                <Link to="/properties" className="underline">Add a unit</Link> first.
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="tenant-startDate">Lease start</label>
            <input id="tenant-startDate" type="date" className={cls('startDate')} aria-invalid={!!errors.startDate} aria-describedby={errId('startDate')}
              {...register('startDate', { required: 'Enter a start date.' })} />
            <Err name="startDate" />
          </div>
          <div>
            <label className="label" htmlFor="tenant-endDate">Lease end</label>
            <input id="tenant-endDate" type="date" className={cls('endDate')} aria-invalid={!!errors.endDate} aria-describedby={errId('endDate')}
              {...register('endDate', {
                required: 'Enter an end date.',
                validate: (v) => (!getValues('startDate') || v > getValues('startDate')) || 'End date must be after the start date.',
              })} />
            <Err name="endDate" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="tenant-monthlyRent">Monthly rent ($)</label>
            <input id="tenant-monthlyRent" type="number" inputMode="decimal" min="1" step="0.01" className={cls('monthlyRent')} aria-invalid={!!errors.monthlyRent} aria-describedby={errId('monthlyRent')} placeholder="1450"
              {...register('monthlyRent', {
                required: 'Enter the monthly rent.',
                validate: (v) => Number(v) > 0 || 'Rent must be greater than zero.',
              })} />
            <Err name="monthlyRent" />
          </div>
          <div>
            <label className="label" htmlFor="tenant-deposit">Deposit ($) <span className="text-slate-500 font-normal">(optional)</span></label>
            <input id="tenant-deposit" type="number" inputMode="decimal" min="0" step="0.01" className={cls('deposit')} aria-invalid={!!errors.deposit} aria-describedby={errId('deposit')} placeholder="0"
              {...register('deposit', { validate: (v) => v === '' || Number(v) >= 0 || 'Deposit cannot be negative.' })} />
            <Err name="deposit" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tenant-notes">Notes <span className="text-slate-500 font-normal">(optional)</span></label>
          <textarea id="tenant-notes" rows={2} className="input resize-none" {...register('notes')} />
        </div>
      </fieldset>

      {mode === 'new' && (
        <p className="text-xs text-slate-500 leading-relaxed">
          If your tenant already has a Farik account with this email, it is linked. Otherwise their account is
          reserved as invited, and they activate it by creating a tenant account with the same email.
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
        {onCancel && (
          <button type="button" className="btn-secondary justify-center" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary justify-center" disabled={isSubmitting || vacantUnits.length === 0} aria-busy={isSubmitting}>
          {isSubmitting ? 'Saving…' : (mode === 'existing' ? 'Create lease' : submitLabel)}
        </button>
      </div>
    </form>
  );
};

export default TenantLeaseForm;
