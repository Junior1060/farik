import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import PasswordInput from '../components/auth/PasswordInput';
import FormError from '../components/auth/FormError';
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
    subtitle: 'Use the email address your landlord has on file so your lease connects automatically.',
    after: '/tenant',
  },
};

/**
 * Self-serve signup. `role` decides which profile the backend creates and where
 * the person lands afterwards; landlords go straight into onboarding. The
 * backend splits the full name and lower-cases the email.
 */
const SignupPage = ({ role = 'LANDLORD' }) => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const copy = COPY[role];

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ mode: 'onTouched' });

  const onSubmit = async (values) => {
    if (isSubmitting) return;
    setFormError('');
    try {
      await registerUser({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        companyName: role === 'LANDLORD' && values.companyName?.trim() ? values.companyName.trim() : undefined,
        role,
      });
      navigate(copy.after, { replace: true });
    } catch (err) {
      setFormError(describeAuthError(err, 'signup'));
    }
  };

  const invalidClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';
  const fieldClass = (name) => `input ${errors[name] ? invalidClass : ''}`;
  const describedBy = (name) => (errors[name] ? `signup-${name}-error` : undefined);

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
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
      }
    >
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
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('email')}
            className={fieldClass('email')}
            placeholder="you@example.com"
            {...register('email', {
              required: 'Enter your email address.',
              validate: (v) => EMAIL_PATTERN.test(v.trim()) || 'Enter a valid email address.',
            })}
          />
          {errors.email && <p id="signup-email-error" className="text-xs text-red-600 mt-1.5">{errors.email.message}</p>}
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
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-slate-500 text-center leading-relaxed">
          By creating an account you agree to the{' '}
          <Link to="/terms" className="underline hover:text-slate-800">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="underline hover:text-slate-800">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
};

export default SignupPage;
