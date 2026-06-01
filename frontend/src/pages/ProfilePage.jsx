import React, { useState, useEffect } from 'react';
import { User, Lock, CheckCircle, AlertCircle, Building2, CreditCard, ExternalLink, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { updateProfile, changePassword } from '../services/profileService';
import { getStripeConnectStatus, connectStripeAccount, getStripeDashboardLink } from '../services/stripeService';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';

const ProfilePage = () => {
  const { user } = useAuth();
  const profile = user?.profile;
  const [searchParams] = useSearchParams();
  const stripeReturn = searchParams.get('stripe');

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Manage your account information" />
      {stripeReturn === 'success' && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-xl px-4 py-3 text-sm mb-5">
          <CheckCircle size={15} /> Stripe account connected successfully! You can now receive rent payments.
        </div>
      )}
      {stripeReturn === 'refresh' && (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-5">
          <AlertCircle size={15} /> Stripe onboarding was not completed. Click "Connect Stripe" to try again.
        </div>
      )}
      <div className="space-y-5">
        <ProfileInfoCard user={user} profile={profile} />
        <StripeConnectCard />
        <ChangePasswordCard />
      </div>
    </div>
  );
};

const ProfileInfoCard = ({ user, profile }) => {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      phone: profile?.phone || '',
      companyName: profile?.companyName || '',
    },
  });

  const onSubmit = async (values) => {
    setSuccess('');
    setError('');
    try {
      await updateProfile(values);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update profile.');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
        <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {profile?.firstName?.[0]}{profile?.lastName?.[0]}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{profile?.firstName} {profile?.lastName}</h2>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <span className="inline-block mt-1 text-xs font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full capitalize">
            {user?.role === 'LANDLORD' ? 'Landlord' : 'Tenant'}
          </span>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <User size={15} /> Personal information
      </h3>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-3 py-2.5 rounded-xl text-sm mb-4">
          <CheckCircle size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3 py-2.5 rounded-xl text-sm mb-4">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First name</label>
            <input className="input" {...register('firstName', { required: true })} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" {...register('lastName', { required: true })} />
          </div>
        </div>
        <div>
          <label className="label">Email address</label>
          <input className="input bg-surface-100 cursor-not-allowed" value={user?.email} disabled />
          <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input className="input" placeholder="(555) 000-0000" {...register('phone')} />
        </div>
        {user?.role === 'LANDLORD' && (
          <div>
            <label className="label flex items-center gap-1.5"><Building2 size={13} /> Company name (optional)</label>
            <input className="input" placeholder="Your property group name" {...register('companyName')} />
          </div>
        )}
        <div className="pt-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

const ChangePasswordCard = () => {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm();
  const newPassword = watch('newPassword');

  const onSubmit = async (values) => {
    setSuccess('');
    setError('');
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setSuccess('Password changed successfully.');
      reset();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to change password.');
    }
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Lock size={15} /> Change password
      </h3>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-3 py-2.5 rounded-xl text-sm mb-4">
          <CheckCircle size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3 py-2.5 rounded-xl text-sm mb-4">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" {...register('currentPassword', { required: true })} />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" placeholder="At least 6 characters" {...register('newPassword', { required: true, minLength: 6 })} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            placeholder="Must match new password"
            {...register('confirmPassword', { required: true, validate: (v) => v === newPassword || 'Passwords do not match' })}
          />
        </div>
        <div className="pt-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
};

const StripeConnectCard = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [dashLoading, setDashLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getStripeConnectStatus()
      .then(setStatus)
      .catch(() => setError('Could not load Stripe status.'))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { url } = await connectStripeAccount();
      window.location.href = url;
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to start Stripe onboarding.');
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    setDashLoading(true);
    try {
      const { url } = await getStripeDashboardLink();
      window.open(url, '_blank');
    } catch (err) {
      setError('Could not open Stripe dashboard.');
    } finally {
      setDashLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
        <CreditCard size={15} /> Stripe Payments
      </h3>
      <p className="text-xs text-slate-400 mb-5">Connect your Stripe account to receive rent payments directly. Farik takes a 1% platform fee.</p>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2.5 text-sm mb-4">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={14} className="animate-spin" /> Checking status...</div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Stripe connected</p>
              <p className="text-xs text-green-600">Your account is active and ready to receive payments.</p>
            </div>
          </div>
          <button onClick={handleDashboard} disabled={dashLoading} className="btn-secondary text-sm">
            <ExternalLink size={14} /> {dashLoading ? 'Opening...' : 'Open Stripe Dashboard'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Not connected</p>
              <p className="text-xs text-amber-600">
                {status?.detailsSubmitted ? 'Onboarding in progress — Stripe is reviewing your details.' : 'Connect Stripe to start accepting rent payments.'}
              </p>
            </div>
          </div>
          <button onClick={handleConnect} disabled={connecting} className="btn-primary">
            <CreditCard size={15} />
            {connecting ? 'Redirecting to Stripe...' : status?.detailsSubmitted ? 'Continue Stripe Setup' : 'Connect Stripe Account'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
