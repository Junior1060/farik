import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CheckCircle2, Loader2 } from 'lucide-react';
import InfoBanner from '../ui/InfoBanner';
import { submitPilotApplication, getPilotConfig } from '../../services/pilotService';
import { PUBLIC_CONTACT_EMAIL } from '../../config/contact';
import track from './track';

const CONTACT_METHODS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'TEXT', label: 'Text message' },
];

const EMPTY = {
  fullName: '',
  email: '',
  phone: '',
  city: '',
  unitsManaged: '',
  preferredContactMethod: '',
  companyName: '',
  currentManagementMethod: '',
  biggestProblem: '',
  additionalNotes: '',
  website: '', // honeypot
};

/** Mirrors the server's zod schema so the applicant gets feedback before a round trip. */
function validate(values) {
  const errors = {};
  if (!values.fullName.trim()) errors.fullName = 'Please enter your full name.';
  if (!values.email.trim()) errors.email = 'Please enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!values.phone.trim()) errors.phone = 'Please enter a phone number.';
  if (!values.city.trim()) errors.city = 'Please enter your city.';

  const units = Number(values.unitsManaged);
  if (String(values.unitsManaged).trim() === '') errors.unitsManaged = 'Enter the number of units you manage.';
  else if (!Number.isInteger(units)) errors.unitsManaged = 'Enter a whole number of units.';
  else if (units < 1) errors.unitsManaged = 'Enter at least 1 unit.';

  if (values.biggestProblem.trim().length < 10) {
    errors.biggestProblem = 'Please give us at least a sentence — 10 characters or more.';
  }
  if (!values.preferredContactMethod) {
    errors.preferredContactMethod = 'Choose how you would like us to reach you.';
  }
  return errors;
}

function Field({ id, label, error, hint, required, children }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="text-red-600" aria-hidden="true"> *</span>}
        {!required && <span className="text-slate-500 font-normal"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600 mt-1.5 break-words">{error}</p>
      )}
    </div>
  );
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessPanel({ application, bookingUrl }) {
  const firstName = application?.firstName;

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={22} className="text-emerald-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-900">Application received</h3>
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">
            {firstName ? `Thanks, ${firstName}. ` : 'Thanks. '}
            {bookingUrl
              ? 'The next step is a short call so we can learn about your properties and show you how Farik works.'
              : 'The Farik team will contact you within one business day to arrange a short call.'}
          </p>
        </div>
      </div>

      {bookingUrl ? (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Next step</p>
          <p className="text-sm text-slate-700 mb-4">
            Book a 15-minute introduction with the Farik team.
          </p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('pilot_booking_clicked', { applicationId: application?.id })}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            <CalendarCheck size={17} aria-hidden="true" />
            Book a 15-minute call
          </a>
          <p className="text-xs text-slate-500 mt-3 text-center">
            We also sent the booking link to {application?.email || 'your email'}.
          </p>
          <p className="text-sm text-slate-600 mt-5 leading-relaxed">
            No sales pressure. We will learn about your workflow, answer questions, and work out
            together whether the pilot is a good fit.
          </p>
        </div>
      ) : (
        <InfoBanner variant="success" className="mt-5">
          We have your details and sent a confirmation to {application?.email || 'your email'}. Someone
          from the Farik team will be in touch within one business day.
        </InfoBanner>
      )}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function PilotApplicationForm() {
  const formId = useId();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [result, setResult] = useState(null);
  const [bookingUrl, setBookingUrl] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const startedRef = useRef(false);
  const inFlightRef = useRef(false);
  const errorRef = useRef(null);
  const successRef = useRef(null);

  // Booking availability is resolved server-side; VITE_BOOKING_URL is only a
  // fallback for a statically hosted frontend that cannot reach the API yet.
  useEffect(() => {
    let cancelled = false;
    getPilotConfig()
      .then((cfg) => { if (!cancelled) setBookingUrl(cfg?.bookingUrl ?? null); })
      .catch(() => {
        if (!cancelled) setBookingUrl(import.meta.env.VITE_BOOKING_URL || null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  const fieldId = (name) => `${formId}-${name}`;

  const setField = (name) => (e) => {
    if (!startedRef.current) {
      startedRef.current = true;
      track('pilot_form_started');
    }
    const value = e.target.value;
    setValues((v) => ({ ...v, [name]: value }));
    // Clear a field's error as soon as the applicant starts fixing it.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const inputProps = (name) => ({
    id: fieldId(name),
    value: values[name],
    onChange: setField(name),
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
    className: `input ${errors[name] ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Guard against double-submit from a fast second click or an Enter keypress
    // landing while the first request is still open.
    if (inFlightRef.current || status === 'submitting' || status === 'success') return;

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Values are preserved — only focus moves to the first problem.
      const first = Object.keys(nextErrors)[0];
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    inFlightRef.current = true;
    setStatus('submitting');
    setSubmitError('');

    try {
      const data = await submitPilotApplication({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        city: values.city,
        unitsManaged: Number(values.unitsManaged),
        preferredContactMethod: values.preferredContactMethod,
        companyName: values.companyName,
        currentManagementMethod: values.currentManagementMethod,
        biggestProblem: values.biggestProblem,
        additionalNotes: values.additionalNotes,
        website: values.website,
        source: 'landing_pilot_section',
      });

      setResult(data.application);
      if (data.bookingUrl) setBookingUrl(data.bookingUrl);
      setStatus('success');
      track('pilot_form_submitted', { duplicate: !!data.duplicate });
    } catch (err) {
      const response = err?.response;
      const fieldErrors = response?.data?.fieldErrors;

      if (fieldErrors && typeof fieldErrors === 'object') {
        setErrors(fieldErrors);
        const first = Object.keys(fieldErrors)[0];
        document.getElementById(fieldId(first))?.focus();
        setStatus('idle');
      } else if (response?.status === 429) {
        setSubmitError(
          'We have received several applications from your network recently. Please try again a little later.',
        );
        setStatus('error');
      } else {
        setSubmitError('We could not submit your application. Please try again, or contact the Farik team directly.');
        setStatus('error');
      }
      track('pilot_form_failed', { status: response?.status || 0 });
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (status === 'error') errorRef.current?.focus();
  }, [status]);

  if (status === 'success') {
    return (
      <div ref={successRef} tabIndex={-1} className="focus:outline-none">
        <SuccessPanel application={result} bookingUrl={bookingUrl} />
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {status === 'error' && (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <InfoBanner variant="danger" title="Something went wrong">
            {submitError}
            {PUBLIC_CONTACT_EMAIL && (
              <>
                {' '}
                <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`} className="underline font-medium">
                  {PUBLIC_CONTACT_EMAIL}
                </a>
              </>
            )}
          </InfoBanner>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fieldId('fullName')} label="Full name" error={errors.fullName} required>
          <input type="text" autoComplete="name" placeholder="Jordan Blake" {...inputProps('fullName')} />
        </Field>

        <Field id={fieldId('email')} label="Email address" error={errors.email} required>
          <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" {...inputProps('email')} />
        </Field>

        <Field id={fieldId('phone')} label="Phone number" error={errors.phone} required>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="(306) 555-0100" {...inputProps('phone')} />
        </Field>

        <Field id={fieldId('city')} label="City" error={errors.city} required>
          <input type="text" autoComplete="address-level2" placeholder="Saskatoon" {...inputProps('city')} />
        </Field>

        <Field id={fieldId('unitsManaged')} label="Units you manage" error={errors.unitsManaged} required>
          <input type="number" inputMode="numeric" min="1" step="1" placeholder="6" {...inputProps('unitsManaged')} />
        </Field>

        <Field
          id={fieldId('preferredContactMethod')}
          label="Preferred contact method"
          error={errors.preferredContactMethod}
          required
        >
          <select {...inputProps('preferredContactMethod')}>
            <option value="">Choose one…</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id={fieldId('biggestProblem')} label="What currently takes the most time?" error={errors.biggestProblem} required>
        <textarea
          rows={3}
          placeholder="Chasing rent, after-hours maintenance texts, paperwork…"
          {...inputProps('biggestProblem')}
          className={`${inputProps('biggestProblem').className} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fieldId('companyName')} label="Company or property name" error={errors.companyName}>
          <input type="text" autoComplete="organization" placeholder="Maple Court Apartments" {...inputProps('companyName')} />
        </Field>

        <Field id={fieldId('currentManagementMethod')} label="How you manage today" error={errors.currentManagementMethod}>
          <input type="text" placeholder="Spreadsheets, texts, a property manager…" {...inputProps('currentManagementMethod')} />
        </Field>
      </div>

      <Field id={fieldId('additionalNotes')} label="Anything else we should know?" error={errors.additionalNotes}>
        <textarea
          rows={2}
          placeholder="Optional"
          {...inputProps('additionalNotes')}
          className={`${inputProps('additionalNotes').className} resize-none`}
        />
      </Field>

      {/* Honeypot. Positioned off-screen rather than display:none so naive bots
          still fill it, and hidden from assistive tech so nobody real ever can. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor={fieldId('website')}>Website</label>
        <input
          id={fieldId('website')}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={setField('website')}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="btn-primary w-full justify-center py-3 text-base"
      >
        {submitting ? (
          <>
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            Submitting application…
          </>
        ) : (
          <>
            Apply for the pilot
            <ArrowRight size={16} aria-hidden="true" />
          </>
        )}
      </button>

      <p className="text-xs text-slate-500 text-center leading-relaxed">
        By applying, you agree that Farik may contact you about the pilot. No payment is required.
        {' '}
        <Link to="/privacy" className="underline hover:text-slate-700">Privacy</Link>
        {' · '}
        <Link to="/terms" className="underline hover:text-slate-700">Terms</Link>
      </p>
      <p className="text-xs text-slate-500 text-center">
        Pilot spaces are limited so each landlord can receive personal onboarding.
      </p>
    </form>
  );
}
