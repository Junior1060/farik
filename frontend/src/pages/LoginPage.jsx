import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useForm } from 'react-hook-form';
import InfoBanner from '../components/ui/InfoBanner';
import { DEMO_LOGIN_ENABLED } from '../config/contact';

const FEATURES = [
  'Tenants text — no app for them to download',
  'Maintenance texts become organized requests',
  'Rent follow-ups prepared for your review',
  'Notices drafted from your lease and payment data',
];

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, setValue, formState: { isSubmitting, errors } } = useForm();

  const onSubmit = async (values) => {
    setError('');
    try {
      const user = await login(values.email, values.password);
      navigate(user.role === 'LANDLORD' ? '/dashboard' : '/tenant');
    } catch (err) {
      setError(err?.response?.data?.error || 'Invalid email or password');
    }
  };

  const fillDemo = (type) => {
    if (type === 'landlord') {
      setValue('email', 'demo@farik.ca');
      setValue('password', 'password123');
    } else {
      setValue('email', 'alice.morgan@email.com');
      setValue('password', 'password123');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding panel */}
      <div className="hidden lg:flex flex-col w-[46%] bg-indigo-600 p-12 justify-between relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-white/5 -translate-x-1/2 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-white/5 translate-x-1/4 translate-y-1/3 pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">Farik</span>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-white leading-tight tracking-tight">
              The AI property manager<br />for landlords with 1–100 units.
            </h2>
            <p className="text-indigo-200 mt-4 text-lg leading-relaxed">
              Your tenants text. Farik handles the routine work — and you approve anything that matters.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={11} className="text-white" />
                </div>
                <span className="text-indigo-100 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust line */}
        <p className="relative text-indigo-200 text-sm">
          Built in Saskatchewan for independent landlords.
        </p>
      </div>

      {/* Right — Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Building2 size={17} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">Farik</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-slate-600 mt-1.5 text-sm">Sign in to your account to continue</p>
          </div>

          {DEMO_LOGIN_ENABLED && (
            <InfoBanner variant="info" className="mb-6">
              This is a demo environment. No real messages, notices, or payments will be sent.
            </InfoBanner>
          )}

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-6 border border-red-200">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label" htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                className={`input ${errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                placeholder="you@example.com"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                })}
              />
              {errors.email && <p id="login-email-error" className="text-xs text-red-600 mt-1.5">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  className={`input pr-10 ${errors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                  placeholder="••••••••"
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p id="login-password-error" className="text-xs text-red-600 mt-1.5">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center py-3 text-sm rounded-xl"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo shortcuts. These prefill the seeded demo credentials — they are
              not secrets, but the block is hidden when VITE_ENABLE_DEMO_LOGIN is
              "false" so a deployment holding real landlord data never shows them. */}
          {DEMO_LOGIN_ENABLED && (
            <div className="mt-7 pt-7 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center mb-3 font-medium uppercase tracking-wide">
                Quick demo access
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillDemo('landlord')}
                  className="btn-secondary justify-center text-xs py-2.5"
                >
                  Explore landlord demo
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('tenant')}
                  className="btn-secondary justify-center text-xs py-2.5"
                >
                  Explore tenant experience
                </button>
              </div>
              <p className="text-xs text-slate-500 text-center mt-2.5">
                Fills the form with demo credentials. Press Sign in to continue.
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 mb-3">New landlord?</p>
            <Link to="/register" className="btn-secondary w-full justify-center py-2.5">
              Create account
            </Link>
            <p className="text-sm text-slate-600 mt-4">
              Want personal onboarding?{' '}
              {/* Plain anchor: the browser resolves the #pilot fragment and scrolls,
                  which react-router's <Link> does not do on its own. */}
              <a href="/#pilot" className="text-brand-600 font-medium hover:underline">
                Apply for the pilot →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
