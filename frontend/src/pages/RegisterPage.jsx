import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useForm } from 'react-hook-form';

const RegisterPage = () => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState('LANDLORD');

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm();

  const onSubmit = async (values) => {
    setError('');
    try {
      const user = await registerUser({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        companyName: role === 'LANDLORD' ? values.companyName : undefined,
        role,
      });
      navigate(user.role === 'LANDLORD' ? '/dashboard' : '/tenant');
    } catch (err) {
      setError(err?.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-7">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <Building2 size={17} className="text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Farik</span>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 mb-0.5">Create your account</h2>
          <p className="text-slate-500 text-sm mb-5">Who are you signing up as?</p>

          {/* Role toggle */}
          <div className="flex rounded-xl border border-slate-200 p-1 mb-6 bg-slate-50">
            <button
              type="button"
              onClick={() => setRole('LANDLORD')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-150 ${
                role === 'LANDLORD'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Landlord
            </button>
            <button
              type="button"
              onClick={() => setRole('TENANT')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-150 ${
                role === 'TENANT'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Tenant
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-5 border border-red-200">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First name *</label>
                <input
                  className={`input ${errors.firstName ? 'border-red-300' : ''}`}
                  placeholder="John"
                  {...register('firstName', { required: 'Required' })}
                />
              </div>
              <div>
                <label className="label">Last name *</label>
                <input
                  className={`input ${errors.lastName ? 'border-red-300' : ''}`}
                  placeholder="Smith"
                  {...register('lastName', { required: 'Required' })}
                />
              </div>
            </div>

            <div>
              <label className="label">Email address *</label>
              <input
                type="email"
                className={`input ${errors.email ? 'border-red-300' : ''}`}
                placeholder={role === 'LANDLORD' ? 'landlord@example.com' : 'tenant@example.com'}
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                })}
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            {role === 'LANDLORD' && (
              <div>
                <label className="label">Company name (optional)</label>
                <input
                  className="input"
                  placeholder="Reynolds Property Group"
                  {...register('companyName')}
                />
              </div>
            )}

            <div>
              <label className="label">Phone (optional)</label>
              <input className="input" placeholder="(555) 200-1000" {...register('phone')} />
            </div>

            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`input pr-10 ${errors.password ? 'border-red-300' : ''}`}
                  placeholder="At least 6 characters"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Must be at least 6 characters' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
            </div>

            {role === 'TENANT' && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-xs text-indigo-700">
                Your landlord will assign you a lease after you sign up. Use the same email they have on file.
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center py-3 text-sm rounded-xl"
            >
              {isSubmitting
                ? 'Creating account…'
                : `Create ${role === 'LANDLORD' ? 'landlord' : 'tenant'} account`}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
