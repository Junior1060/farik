import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Upload } from 'lucide-react';
import Logo from '../components/marketing/Logo';
import FormError from '../components/auth/FormError';
import TenantLeaseForm from '../components/tenants/TenantLeaseForm';
import ImportWizard from '../components/import/ImportWizard';
import { useAuth } from '../context/AuthContext';
import { createProperty } from '../services/propertyService';
import { PROPERTY_TYPE_OPTIONS } from '../utils/propertyTypes';
import { describeAuthError } from '../utils/authErrors';

const IMPORT_FORMATS = ['PDF', 'Excel', 'CSV', 'Word', 'Images'];

const STEP_LABELS = { welcome: 'Welcome', property: 'First property', tenant: 'Tenants' };
const TRACK = ['welcome', 'property', 'tenant'];

// ── Layout ──────────────────────────────────────────────────────────────────

const Shell = ({ step, children }) => (
  <div className="min-h-screen bg-white flex flex-col">
    <header className="border-b border-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo to={null} />
        <Link to="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          Skip for now
        </Link>
      </div>
    </header>

    <main className="flex-1">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <ol className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-8 flex-wrap" aria-label="Setup progress">
          {TRACK.map((s, i) => {
            const activeIndex = TRACK.indexOf(step === 'import' ? 'property' : step);
            const state = i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
            return (
              <li key={s} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    state === 'todo' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-600 text-white'
                  }`}
                  aria-hidden="true"
                >
                  {state === 'done' ? <CheckCircle2 size={12} /> : i + 1}
                </span>
                <span className={state === 'current' ? 'text-slate-900' : ''}>{STEP_LABELS[s]}</span>
                {i < TRACK.length - 1 && <span className="w-6 h-px bg-slate-200 mx-1" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        {children}
      </div>
    </main>
  </div>
);

// ── Steps ───────────────────────────────────────────────────────────────────

const WelcomeStep = ({ firstName, onImport, onManual }) => (
  <div>
    <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight">
      Welcome to Farik{firstName ? `, ${firstName}` : ''}
    </h1>
    <p className="text-slate-600 text-base sm:text-lg mt-3 leading-relaxed max-w-xl">
      Let’s get your rentals into Farik. Import what you already have, or set things up by hand.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
      <button
        type="button"
        onClick={onImport}
        className="group text-left border border-slate-200 rounded-2xl p-5 hover:border-slate-400 hover:shadow-card-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4" aria-hidden="true">
          <Upload size={18} className="text-slate-700" />
        </span>
        <span className="block font-semibold text-slate-900">Import my property data</span>
        <span className="block text-sm text-slate-600 mt-1 leading-relaxed">
          Spreadsheets, rent rolls, leases, or PDFs. Farik reads them and you review before anything is saved.
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 mt-4 group-hover:gap-2 transition-all">
          Import <ArrowRight size={14} aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={onManual}
        className="group text-left border border-slate-200 rounded-2xl p-5 hover:border-slate-400 hover:shadow-card-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4" aria-hidden="true">
          <Building2 size={18} className="text-slate-700" />
        </span>
        <span className="block font-semibold text-slate-900">Set up manually</span>
        <span className="block text-sm text-slate-600 mt-1 leading-relaxed">
          Add your first property and its tenants by hand. Takes a couple of minutes.
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 mt-4 group-hover:gap-2 transition-all">
          Set up <ArrowRight size={14} aria-hidden="true" />
        </span>
      </button>
    </div>

    <p className="text-sm text-slate-500 mt-8">
      Not ready?{' '}
      <Link to="/dashboard" className="font-medium text-slate-700 underline-offset-4 hover:underline">Skip for now</Link>
      {' '}and do this later from the dashboard.
    </p>
  </div>
);

const ImportStep = ({ onBack }) => (
  <div>
    <button type="button" onClick={onBack} className="btn-ghost -ml-3 mb-4 text-slate-600">
      <ArrowLeft size={15} aria-hidden="true" /> Back
    </button>
    <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">Upload your existing property files</h1>
    <p className="text-slate-600 mt-3 leading-relaxed max-w-xl">
      Upload leases, spreadsheets, tenant lists, rent rolls, or property documents and Farik will help organize them.
      You review everything before it is saved.
    </p>
    <ul className="flex flex-wrap gap-2 mt-4" aria-label="Accepted file types">
      {IMPORT_FORMATS.map((f) => (
        <li key={f} className="text-xs font-medium text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">{f}</li>
      ))}
    </ul>
    <div className="mt-6">
      <ImportWizard />
    </div>
    <p className="text-sm text-slate-500 mt-6">
      Prefer to type it in?{' '}
      <button type="button" onClick={onBack} className="font-medium text-slate-700 underline-offset-4 hover:underline">
        Set up manually instead
      </button>
    </p>
  </div>
);

const PropertyStep = ({ onBack, onCreated }) => {
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    mode: 'onTouched',
    defaultValues: { unitCount: 1, propertyType: '' },
  });

  const onSubmit = async (values) => {
    if (isSubmitting) return;
    setFormError('');
    try {
      const { property } = await createProperty({
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        zip: values.zip.trim(),
        propertyType: values.propertyType || null,
        unitCount: Number(values.unitCount),
      });
      onCreated(property);
    } catch (err) {
      setFormError(describeAuthError(err, 'form'));
    }
  };

  const invalidClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';
  const cls = (name) => `input ${errors[name] ? invalidClass : ''}`;
  const Err = ({ name }) => (errors[name]
    ? <p id={`property-${name}-error`} className="text-xs text-red-600 mt-1.5">{errors[name].message}</p>
    : null);
  const required = (label) => ({ validate: (v) => (v && String(v).trim().length > 0) || `Enter the ${label}.` });

  return (
    <div>
      <button type="button" onClick={onBack} className="btn-ghost -ml-3 mb-4 text-slate-600">
        <ArrowLeft size={15} aria-hidden="true" /> Back
      </button>
      <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">Add your first property</h1>
      <p className="text-slate-600 mt-3 leading-relaxed max-w-xl">
        Just the basics. Units are created for you and you can rename them or set rents later.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5 max-w-xl">
        <FormError>{formError}</FormError>

        <div>
          <label className="label" htmlFor="property-name">Property name</label>
          <input id="property-name" className={cls('name')} placeholder="Maple Court" autoFocus aria-invalid={!!errors.name} aria-describedby={errors.name ? 'property-name-error' : undefined}
            {...register('name', required('property name'))} />
          <Err name="name" />
        </div>

        <div>
          <label className="label" htmlFor="property-address">Street address</label>
          <input id="property-address" className={cls('address')} autoComplete="street-address" placeholder="123 Main Street" aria-invalid={!!errors.address} aria-describedby={errors.address ? 'property-address-error' : undefined}
            {...register('address', required('street address'))} />
          <Err name="address" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="property-city">City</label>
            <input id="property-city" className={cls('city')} autoComplete="address-level2" placeholder="Regina" aria-invalid={!!errors.city} aria-describedby={errors.city ? 'property-city-error' : undefined}
              {...register('city', required('city'))} />
            <Err name="city" />
          </div>
          <div>
            <label className="label" htmlFor="property-state">Province</label>
            <input id="property-state" className={cls('state')} autoComplete="address-level1" placeholder="SK" aria-invalid={!!errors.state} aria-describedby={errors.state ? 'property-state-error' : undefined}
              {...register('state', required('province'))} />
            <Err name="state" />
          </div>
          <div>
            <label className="label" htmlFor="property-zip">Postal code</label>
            <input id="property-zip" className={cls('zip')} autoComplete="postal-code" placeholder="S4S 4H4" aria-invalid={!!errors.zip} aria-describedby={errors.zip ? 'property-zip-error' : undefined}
              {...register('zip', required('postal code'))} />
            <Err name="zip" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="property-type">Property type</label>
            <select id="property-type" className={cls('propertyType')} aria-invalid={!!errors.propertyType} aria-describedby={errors.propertyType ? 'property-propertyType-error' : undefined}
              {...register('propertyType', { required: 'Choose a property type.' })}>
              <option value="">Choose one</option>
              {PROPERTY_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Err name="propertyType" />
          </div>
          <div>
            <label className="label" htmlFor="property-unitCount">Number of units</label>
            <input id="property-unitCount" type="number" inputMode="numeric" min="1" max="500" step="1" className={cls('unitCount')} aria-invalid={!!errors.unitCount} aria-describedby={errors.unitCount ? 'property-unitCount-error' : 'property-unitCount-hint'}
              {...register('unitCount', {
                required: 'Enter how many units this property has.',
                validate: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 500) || 'Enter a whole number from 1 to 500.',
              })} />
            {errors.unitCount
              ? <Err name="unitCount" />
              : <p id="property-unitCount-hint" className="text-xs text-slate-500 mt-1.5">A house is 1 unit.</p>}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          <Link to="/dashboard" className="btn-secondary justify-center">Skip for now</Link>
          <button type="submit" className="btn-primary justify-center" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? 'Saving property…' : 'Save and continue'}
            {!isSubmitting && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </form>
    </div>
  );
};

const TenantStep = ({ property, onBack }) => {
  const navigate = useNavigate();
  const [added, setAdded] = useState([]);
  const [showForm, setShowForm] = useState(true);
  // The form is keyed so "Add another" gives a fresh form rather than stale values.
  const [formKey, setFormKey] = useState(0);
  const [propertyState, setPropertyState] = useState(property);
  const headingRef = useRef(null);

  useEffect(() => { headingRef.current?.focus(); }, [showForm]);

  const handleAdded = ({ tenant, lease }) => {
    setAdded((prev) => [...prev, { tenant, lease }]);
    // Mark the unit occupied locally so it drops out of the next form's unit list.
    setPropertyState((p) => ({
      ...p,
      units: p.units.map((u) => (u.id === lease.unitId ? { ...u, isOccupied: true } : u)),
    }));
    setShowForm(false);
  };

  const vacantLeft = propertyState.units.filter((u) => !u.isOccupied).length;

  return (
    <div>
      {added.length === 0 && (
        <button type="button" onClick={onBack} className="btn-ghost -ml-3 mb-4 text-slate-600">
          <ArrowLeft size={15} aria-hidden="true" /> Back
        </button>
      )}
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight focus:outline-none">
        {showForm ? 'Add tenants' : 'Tenant added'}
      </h1>
      <p className="text-slate-600 mt-3 leading-relaxed max-w-xl">
        {showForm
          ? <>Connect a tenant to a unit at <span className="font-medium text-slate-900">{property.name}</span>. Their lease is created at the same time. You can add more from the Tenants page any time.</>
          : <>Everything is connected. Add another tenant, or head to your dashboard.</>}
      </p>

      {added.length > 0 && (
        <ul className="mt-6 space-y-2" aria-label="Tenants added">
          {added.map(({ tenant, lease }) => (
            <li key={tenant.id} className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-3 text-sm">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" aria-hidden="true" />
              <span className="text-slate-800">
                <span className="font-medium">{tenant.firstName} {tenant.lastName}</span>
                {' '}· {lease.unit?.name || 'Unit'} · ${Number(lease.monthlyRent).toLocaleString()}/mo
              </span>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="mt-8 max-w-xl">
          <TenantLeaseForm
            key={formKey}
            properties={[propertyState]}
            defaultPropertyId={propertyState.id}
            onSuccess={handleAdded}
            submitLabel="Add tenant"
          />
          <p className="text-sm text-slate-500 mt-6">
            No tenants yet?{' '}
            <Link to="/dashboard" className="font-medium text-slate-700 underline-offset-4 hover:underline">Skip for now</Link>
            {' '}— you can add them whenever they move in.
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button type="button" className="btn-primary justify-center" onClick={() => navigate('/dashboard')}>
            Go to dashboard <ArrowRight size={15} aria-hidden="true" />
          </button>
          {vacantLeft > 0 && (
            <button type="button" className="btn-secondary justify-center" onClick={() => { setFormKey((k) => k + 1); setShowForm(true); }}>
              Add another tenant
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

/**
 * First-run setup for a new landlord: welcome → import or manual property →
 * tenants → dashboard. Nothing here is mandatory; every step can be skipped and
 * the same actions live in the app.
 */
export default function OnboardingPage() {
  const { user } = useAuth();
  const [step, setStep] = useState('welcome');
  const [property, setProperty] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  return (
    <Shell step={step}>
      {step === 'welcome' && (
        <WelcomeStep
          firstName={user?.profile?.firstName}
          onImport={() => setStep('import')}
          onManual={() => setStep('property')}
        />
      )}
      {step === 'import' && <ImportStep onBack={() => setStep('welcome')} />}
      {step === 'property' && (
        <PropertyStep
          onBack={() => setStep('welcome')}
          onCreated={(created) => { setProperty(created); setStep('tenant'); }}
        />
      )}
      {step === 'tenant' && property && (
        <TenantStep property={property} onBack={() => setStep('property')} />
      )}
    </Shell>
  );
}
