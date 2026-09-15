import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import PasswordInput from '../components/auth/PasswordInput';
import FormError from '../components/auth/FormError';
import { describeAuthError } from '../utils/authErrors';
import { DEMO_LOGIN_ENABLED } from '../config/demo';

const homeFor = (user) => (user.role === 'LANDLORD' ? '/dashboard' : '/tenant');

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ mode: 'onTouched' });

  const onSubmit = async (values) => {
    if (isSubmitting) return;
    setFormError('');
    try {
      const user = await login(values.email.trim(), values.password);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setFormError(describeAuthError(err, 'login'));
    }
  };

  // Seeded demo credentials (not secrets), shown only when the deployment
  // explicitly opts in with VITE_ENABLE_DEMO_LOGIN=true.
  const fillDemo = (type) => {
    setValue('email', type === 'landlord' ? 'demo@farik.ca' : 'alice.morgan@email.com', { shouldValidate: true });
    setValue('password', 'password123', { shouldValidate: true });
  };

  const invalidClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your Farik account."
      footer={
        <>
          New to Farik?{' '}
          <Link to="/signup" className="font-semibold text-slate-900 underline-offset-4 hover:underline">Create an account</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormError>{formError}</FormError>

        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className={`input ${errors.email ? invalidClass : ''}`}
            placeholder="you@example.com"
            {...register('email', { required: 'Enter your email address.' })}
          />
          {errors.email && <p id="login-email-error" className="text-xs text-red-600 mt-1.5">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            className={errors.password ? invalidClass : ''}
            placeholder="Your password"
            {...register('password', { required: 'Enter your password.' })}
          />
          {errors.password && <p id="login-password-error" className="text-xs text-red-600 mt-1.5">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="btn-primary w-full justify-center py-3 text-sm rounded-xl mt-1"
        >
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {DEMO_LOGIN_ENABLED && (
        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-500 text-center mb-3 font-medium uppercase tracking-wide">Demo environment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button type="button" onClick={() => fillDemo('landlord')} className="btn-secondary justify-center text-xs py-2.5">
              Fill landlord demo
            </button>
            <button type="button" onClick={() => fillDemo('tenant')} className="btn-secondary justify-center text-xs py-2.5">
              Fill tenant demo
            </button>
          </div>
          <p className="text-xs text-slate-500 text-center mt-2.5">Fills the form with seeded credentials. Press Log in to continue.</p>
        </div>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
