import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import PasswordInput from '../components/auth/PasswordInput';
import FormError from '../components/auth/FormError';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getInvite } from '../services/inviteService';
import { describeAuthError } from '../utils/authErrors';

const PASSWORD_MIN = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COPY = {
  LANDLORD: {
    title: 'Create your account',
    subtitle: 'Set up Farik for your rentals in about a minute. No application, no sales call.',
    after: '/onboarding',
  },
  TENANT: {
    title: 'Activate your tenant account',
    subtitle: 'Set a password for the account your landlord created for you.',
    after: '/tenant',
  },
};

export const INVITE_REQUIRED = 'Tenant accounts are created by your landlord. Open the invitation link they sent you to set your password.';
export const INVITE_INVALID = 'This invitation link is invalid or has expired. Ask your landlord for a new one.';

/**
 * Self-serve signup. `role` decides which profile the backend creates and where the
 * person lands afterwards; landlords go straight into onboarding.
 *
 * Tenants never create an account from scratch. Their landlord reserves one and
 * shares an invitation link (/signup/tenant?invite=…); this page checks the link,
 * locks the email to the one on file, and sends the token along with the password.
 * Without a valid link there is no form — knowing an email address must never be
 * enough to claim a tenant's lease, payments and messages.
 */
const SignupPage = ({ role = 'LANDLORD' }) => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = role === 'TENANT' ? searchParams.get('invite') : null;
  // null: checking the link; false: no usable link; object: who the link is for.
  const [invite, setInvite] = useState(inviteToken ? null : false);
  const [formError, setFormError] = useState('');
  const copy = COPY[role];

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ mode: 'onTouched' });

  useEffect(() => {
    if (!inviteToken) return undefined;
    let cancelled = false;
    getInvite(inviteToken)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        setValue('fullName', `${data.firstName || ''} ${data.lastName || ''}`.trim());
        setValue('email', data.email);
      })
      .catch(() => { if (!cancelled) setInvite(false); });
    return () => { cancelled = true; };
  }, [inviteToken, setValue]);

  const onSubmit = async (values) => {
    if (isSubmitting) return;
    setFormError('');
    try {
      await registerUser({
        fullName: values.fullName.trim(),
        // The invited email is the only one the backend will accept for this link.
        email: (role === 'TENANT' && invite?.email ? invite.email : values.email).trim().toLowerCase(),
        password: values.password,
        companyName: role === 'LANDLORD' && values.companyName?.trim() ? values.companyName.trim() : undefined,
        role,
        ...(role === 'TENANT' ? { inviteToken } : {}),
      });
      navigate(copy.after, { replace: true });
    } catch (err) {
      setFormError(describeAuthError(err, 'signup'));
    }
  };

  const invalidClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';
  const fieldClass = (name) => `input ${errors[name] ? invalidClass : ''}`;
  const describedBy = (name) => (errors[name] ? `signup-${name}-error` : undefined);

  const footer = (
    <>
      Already have an account?{' '}
      <Link to="/login" className="font-semibold text-slate-900 underline-offset-4 hover:underline">Log in</Link>
      {role === 'TENANT' ? (
        <p className="mt-3 text-slate-500">
          Are you a landlord?{' '}
          <Link to="/signup" className="font-medium text-slate-700 underline-offset-4 hover:underline">Get started here</Link>
        </p>
      ) : (
        <p className="mt-3 text-slate-500">
          Renting from a Farik landlord?{' '}
          <Link to="/signup/tenant" className="font-medium text-slate-700 underline-offset-4 hover:underline">Activate your tenant account</Link>
        </p>
      )}
    </>
  );

  if (role === 'TENANT' && invite === false) {
    return (
      <AuthLayout title={copy.title} subtitle={inviteToken ? INVITE_INVALID : INVITE_REQUIRED} footer={footer}>
        <div role="status" className="text-sm text-slate-600 leading-relaxed space-y-3">
          <p>
            {inviteToken
              ? 'Invitation links expire after 14 days and stop working once the account has been activated.'
              : 'Your landlord can send the link from the Tenants page in Farik.'}
          </p>
          <p>
            Already activated your account?{' '}
            <Link to="/login" className="font-medium text-slate-900 underline-offset-4 hover:underline">Log in</Link>.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (role === 'TENANT' && invite === null) {
    return (
      <AuthLayout title={copy.title} subtitle="Checking your invitation…" footer={footer}>
        <div className="py-6 flex justify-center" aria-busy="true"><LoadingSpinner /></div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={copy.title} subtitle={copy.subtitle} footer={footer}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormError>{formError}</FormError>

        <div>
          <label className="label" htmlFor="signup-fullName">Full name</label>
          <input
            id="signup-fullName"
            type="text"
            autoComplete="name"
            autoFocus
            aria-invalid={!!errors.fullName}
            aria-describedby={describedBy('fullName')}
            className={fieldClass('fullName')}
            placeholder="Jordan Blake"
            {...register('fullName', {
              validate: (v) => (v && v.trim().length > 0) || 'Enter your name.',
              maxLength: { value: 160, message: 'That name is too long.' },
            })}
          />
          {errors.fullName && <p id="signup-fullName-error" className="text-xs text-red-600 mt-1.5">{errors.fullName.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            readOnly={role === 'TENANT'}
            aria-invalid={!!errors.email}
            aria-describedby={role === 'TENANT' ? 'signup-email-hint' : describedBy('email')}
            className={`${fieldClass('email')} ${role === 'TENANT' ? 'bg-slate-50 text-slate-600' : ''}`}
            placeholder="you@example.com"
            {...register('email', {
              required: 'Enter your email address.',
              validate: (v) => EMAIL_PATTERN.test(v.trim()) || 'Enter a valid email address.',
            })}
          />
          {role === 'TENANT' ? (
            <p id="signup-email-hint" className="text-xs text-slate-500 mt-1.5">This is the email your landlord has on file for you.</p>
          ) : (
            errors.email && <p id="signup-email-error" className="text-xs text-red-600 mt-1.5">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="signup-password">Password</label>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-hint'}
            className={errors.password ? invalidClass : ''}
            placeholder={`At least ${PASSWORD_MIN} characters`}
            {...register('password', {
              required: 'Choose a password.',
              minLength: { value: PASSWORD_MIN, message: `Password must be at least ${PASSWORD_MIN} characters.` },
              maxLength: { value: 128, message: 'Password is too long.' },
            })}
          />
          {errors.password ? (
            <p id="signup-password-error" className="text-xs text-red-600 mt-1.5">{errors.password.message}</p>
          ) : (
            <p id="signup-password-hint" className="text-xs text-slate-500 mt-1.5">Use at least {PASSWORD_MIN} characters.</p>
          )}
        </div>

        {role === 'LANDLORD' && (
          <div>
            <label className="label" htmlFor="signup-companyName">
              Company or property management name <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              id="signup-companyName"
              type="text"
              autoComplete="organization"
              className="input"
              placeholder="Blake Rentals"
              {...register('companyName', { maxLength: { value: 120, message: 'That name is too long.' } })}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="btn-primary w-full justify-center py-3 text-sm rounded-xl mt-1"
        >
          {isSubmitting ? (role === 'TENANT' ? 'Activating…' : 'Creating account…') : (role === 'TENANT' ? 'Activate account' : 'Create account')}
        </button>

        <p className="text-xs text-slate-500 text-center leading-relaxed">
          By {role === 'TENANT' ? 'activating' : 'creating'} an account you agree to the{' '}
          <Link to="/terms" className="underline hover:text-slate-800">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="underline hover:text-slate-800">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
};

export default SignupPage;
