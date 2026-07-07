import React, { useState, useRef, useEffect } from 'react';
import {
  Home, CreditCard, FileText, Bell, MessageSquare, Wrench,
  LogOut, Building2, Send, CheckCircle, AlertCircle, Clock, User, Lock,
  ImagePlus, X
} from 'lucide-react';
import { updateProfile, changePassword } from '../services/profileService';
import { createCheckoutSession } from '../services/stripeService';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PaymentStatusBadge from '../components/ui/PaymentStatusBadge';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import Modal from '../components/ui/Modal';
import useFetch from '../hooks/useFetch';
import { getMyPayments } from '../services/paymentService';
import { getNotices } from '../services/noticeService';
import { getMaintenanceRequests, createMaintenanceRequest } from '../services/maintenanceService';
import { getConversations, getThread, sendMessage } from '../services/messageService';
import { formatDate, formatRelative, formatCurrency, fullName, getInitials } from '../utils/formatters';
import { useForm } from 'react-hook-form';
import api, { assetUrl } from '../services/api';

const TenantPortalPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [threadData, setThreadData] = useState(null);
  const [sending, setSending] = useState(false);
  const [activeConvId, setActiveConvId] = useState(null);
  const [maintPhotos, setMaintPhotos] = useState([]); // { file, url }[]
  const bottomRef = useRef(null);

  const profile = user?.profile;

  const { data: paymentsData, loading: loadingPayments } = useFetch(getMyPayments);
  const { data: noticesData } = useFetch(getNotices);
  const { data: maintData, refetch: refetchMaint } = useFetch(getMaintenanceRequests);
  const { data: convsData } = useFetch(getConversations);

  const payments = paymentsData?.payments || [];
  const notices = noticesData?.notices || [];
  const maintenanceRequests = maintData?.requests || [];
  const conversations = convsData?.conversations || [];

  const latestPayment = payments[0];
  const activeLease = payments?.[0]?.lease;

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      const convId = conversations[0].id;
      setActiveConvId(convId);
      getThread(convId).then(setThreadData);
    }
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadData?.messages]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handlePhotoSelect = (e) => {
    const picked = Array.from(e.target.files || []).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setMaintPhotos((prev) => [...prev, ...picked].slice(0, 8));
    e.target.value = ''; // allow re-selecting the same file
  };

  const removePhoto = (idx) => {
    setMaintPhotos((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const closeMaintModal = () => {
    setShowMaintModal(false);
    reset();
    maintPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setMaintPhotos([]);
  };

  const onMaintSubmit = async (values) => {
    const unitId = activeLease?.unit?.id || activeLease?.unitId;
    await createMaintenanceRequest(
      {
        unitId,
        title: values.title,
        description: values.description,
        priority: values.priority,
      },
      maintPhotos.map((p) => p.file),
    );
    closeMaintModal();
    refetchMaint();
  };

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      if (activeConvId) {
        await sendMessage(activeConvId, { body: messageText.trim() });
        const updated = await getThread(activeConvId);
        setThreadData(updated);
      } else {
        const res = await sendMessage('new', {
          body: messageText.trim(),
          tenantId: profile?.id,
          subject: 'Message from tenant',
        });
        setActiveConvId(res.conversationId);
        const updated = await getThread(res.conversationId);
        setThreadData(updated);
      }
      setMessageText('');
    } finally {
      setSending(false);
    }
  };

  const tabs = [
    { id: 'overview', icon: Home, label: 'Overview' },
    { id: 'payments', icon: CreditCard, label: 'Payments' },
    { id: 'maintenance', icon: Wrench, label: 'Maintenance' },
    { id: 'messages', icon: MessageSquare, label: 'Messages' },
    { id: 'notices', icon: Bell, label: 'Notices' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const pendingPayment = payments.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE');

  return (
    <div className="min-h-screen bg-surface-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Farik</span>
            <span className="text-slate-500 text-sm ml-2">Tenant Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{profile?.firstName} {profile?.lastName}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium">
              <LogOut size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Rent due card */}
            {pendingPayment ? (
              <div className={`card border-2 ${pendingPayment.status === 'OVERDUE' ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-3">
                  {pendingPayment.status === 'OVERDUE' ? (
                    <AlertCircle size={24} className="text-red-600 flex-shrink-0" />
                  ) : (
                    <Clock size={24} className="text-amber-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`font-semibold ${pendingPayment.status === 'OVERDUE' ? 'text-red-800' : 'text-amber-800'}`}>
                      {pendingPayment.status === 'OVERDUE' ? 'Rent Overdue!' : 'Rent Due'}
                    </p>
                    <p className={`text-sm ${pendingPayment.status === 'OVERDUE' ? 'text-red-700' : 'text-amber-700'}`}>
                      {formatCurrency(pendingPayment.amount)} was due on {formatDate(pendingPayment.dueDate)}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <PaymentStatusBadge status={pendingPayment.status} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-emerald-200 bg-emerald-50">
                <div className="flex items-center gap-3">
                  <CheckCircle size={24} className="text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800">All payments up to date</p>
                    <p className="text-sm text-emerald-700">No outstanding rent balance</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lease summary */}
            {activeLease && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={16} className="text-slate-400" />
                  <h3 className="section-title">Lease Summary</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Unit</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeLease.unit?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Property</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeLease.unit?.property?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Monthly Rent</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(activeLease.monthlyRent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Lease Start</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(activeLease.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Lease End</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(activeLease.endDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Status</p>
                    <div className="mt-0.5">
                      <StatusBadge status={activeLease.status} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowMaintModal(true)} className="card flex items-center gap-3 hover:border-brand-300 transition-colors cursor-pointer text-left">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Wrench size={18} className="text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">Submit Request</p>
                  <p className="text-xs text-slate-400">Report an issue</p>
                </div>
              </button>
              <button onClick={() => setActiveTab('messages')} className="card flex items-center gap-3 hover:border-brand-300 transition-colors cursor-pointer text-left">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={18} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">Message</p>
                  <p className="text-xs text-slate-400">Contact landlord</p>
                </div>
              </button>
            </div>

            {/* Recent payments snippet */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title">Recent Payments</h3>
                <button onClick={() => setActiveTab('payments')} className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</button>
              </div>
              {payments.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-slate-400">Due {formatDate(p.dueDate)}</p>
                  </div>
                  <PaymentStatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <PaymentsTab payments={payments} loading={loadingPayments} />
        )}

        {/* MAINTENANCE TAB */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">{maintenanceRequests.length} requests submitted</p>
              <button className="btn-primary" onClick={() => setShowMaintModal(true)}>
                <Wrench size={15} /> New Request
              </button>
            </div>
            {maintenanceRequests.length === 0 ? (
              <div className="card py-12 text-center">
                <Wrench size={28} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No maintenance requests</p>
                <p className="text-slate-400 text-sm mt-1">Submit a request when you have an issue</p>
              </div>
            ) : (
              maintenanceRequests.map((req) => (
                <div key={req.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{req.title}</h3>
                        <PriorityBadge priority={req.priority} />
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{req.unit?.name} · {req.unit?.property?.name}</p>
                      <p className="text-sm text-slate-600 mt-2">{req.description}</p>
                      {req.photos?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {req.photos.map((src, i) => (
                            <a key={i} href={assetUrl(src)} target="_blank" rel="noreferrer">
                              <img
                                src={assetUrl(src)}
                                alt={`Photo ${i + 1}`}
                                className="w-16 h-16 rounded-lg object-cover border border-slate-200 hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400 mt-2">Submitted {formatRelative(req.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div className="card p-0 overflow-hidden" style={{ height: '500px' }}>
            <div className="px-5 py-3.5 border-b border-slate-100">
              <p className="font-semibold text-slate-800 text-sm">Conversation with Landlord</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-50" style={{ height: '370px' }}>
              {(!threadData?.messages || threadData.messages.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-8">No messages yet. Send a message to your landlord.</p>
              ) : (
                (threadData?.messages || []).map((msg) => {
                  const isOwn = msg.sender?.id === user?.id;
                  const senderProfile = isOwn ? msg.sender?.landlordProfile : msg.sender?.tenantProfile;
                  return (
                    <div key={msg.id} className={`flex gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isOwn ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {getInitials(senderProfile?.firstName, senderProfile?.lastName)}
                      </div>
                      <div className={`max-w-xs ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${isOwn ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 shadow-card rounded-tl-sm'}`}>
                          {msg.body}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{formatRelative(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-slate-100 bg-white flex gap-2">
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Message your landlord..."
                className="input flex-1"
              />
              <button onClick={handleSend} disabled={!messageText.trim() || sending} className="btn-primary px-3 py-2">
                {sending ? <LoadingSpinner size="sm" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* NOTICES TAB */}
        {activeTab === 'profile' && (
          <TenantProfileTab user={user} profile={profile} />
        )}

        {activeTab === 'notices' && (
          <div className="space-y-3">
            {notices.length === 0 ? (
              <div className="card py-12 text-center">
                <Bell size={28} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No notices</p>
                <p className="text-slate-400 text-sm mt-1">You have no notices from your landlord</p>
              </div>
            ) : (
              notices.map((notice) => (
                <div key={notice.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{notice.title}</h3>
                        <StatusBadge status={notice.status} />
                      </div>
                      {notice.sentAt && <p className="text-xs text-slate-400 mt-1">Received {formatDate(notice.sentAt)}</p>}
                    </div>
                  </div>
                  <div className="mt-3 bg-surface-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{notice.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Maintenance Request Modal */}
      <Modal open={showMaintModal} onClose={closeMaintModal} title="Submit Maintenance Request">
        <form onSubmit={handleSubmit(onMaintSubmit)} className="space-y-4">
          <div>
            <label className="label">Issue Title *</label>
            <input className="input" placeholder="e.g. Leaking kitchen faucet" {...register('title', { required: true })} />
          </div>
          <div>
            <label className="label">Description *</label>
            <textarea rows={4} className="input resize-none" placeholder="Describe the issue in detail..." {...register('description', { required: true })} />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" {...register('priority')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High – Urgent</option>
            </select>
          </div>
          <div>
            <label className="label">Photos (optional)</label>
            <div className="flex flex-wrap gap-2">
              {maintPhotos.map((p, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                  <img src={p.url} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded-full w-4 h-4 flex items-center justify-center"
                    aria-label="Remove photo"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {maintPhotos.length < 8 && (
                <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-400 hover:text-indigo-500 flex items-center justify-center cursor-pointer transition-colors">
                  <ImagePlus size={18} />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                </label>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Add up to 8 photos to help explain the issue (max 10MB each).</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={closeMaintModal}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const PaymentsTab = ({ payments, loading }) => {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState('');

  const handlePayRent = async (paymentId) => {
    setPayingId(paymentId);
    setPayError('');
    try {
      const { url } = await createCheckoutSession(paymentId);
      window.location.href = url;
    } catch (err) {
      setPayError(err?.response?.data?.error || 'Payment could not be started. Please try again.');
      setPayingId(null);
    }
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="section-title">Payment History</h3>
      </div>
      {payError && (
        <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2.5 text-sm">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {payError}
        </div>
      )}
      {loading ? (
        <div className="p-8 flex justify-center"><LoadingSpinner /></div>
      ) : payments.length === 0 ? (
        <div className="px-6 py-12 text-center text-slate-400 text-sm">No payment records yet.</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {payments.map((p) => {
            const unpaid = p.status === 'PENDING' || p.status === 'OVERDUE';
            return (
              <div key={p.id} className="flex items-center gap-4 px-6 py-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.status === 'PAID' ? 'bg-emerald-50' : p.status === 'OVERDUE' ? 'bg-red-50' : 'bg-amber-50'}`}>
                  {p.status === 'PAID' ? <CheckCircle size={15} className="text-emerald-600" /> : p.status === 'OVERDUE' ? <AlertCircle size={15} className="text-red-600" /> : <Clock size={15} className="text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-slate-400">{p.lease?.unit?.name} · Due {formatDate(p.dueDate)}</p>
                  {p.stripePaymentIntentId && (
                    <p className="text-xs text-slate-300 mt-0.5 font-mono truncate">ref: {p.stripePaymentIntentId.slice(-8)}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <PaymentStatusBadge status={p.status} />
                    {p.paidDate && <p className="text-xs text-slate-400 mt-0.5">Paid {formatDate(p.paidDate)}</p>}
                  </div>
                  {unpaid && (
                    <button
                      onClick={() => handlePayRent(p.id)}
                      disabled={payingId === p.id}
                      className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
                    >
                      <CreditCard size={13} />
                      {payingId === p.id ? 'Redirecting...' : 'Pay Now'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TenantProfileTab = ({ user, profile }) => {
  const [infoSuccess, setInfoSuccess] = useState('');
  const [infoError, setInfoError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  const infoForm = useForm({
    defaultValues: { firstName: profile?.firstName || '', lastName: profile?.lastName || '', phone: profile?.phone || '' },
  });
  const pwForm = useForm();
  const newPassword = pwForm.watch('newPassword');

  const onInfoSubmit = async (values) => {
    setInfoSuccess(''); setInfoError('');
    try {
      await updateProfile(values);
      setInfoSuccess('Profile updated.');
    } catch (err) {
      setInfoError(err?.response?.data?.error || 'Failed to update.');
    }
  };

  const onPwSubmit = async (values) => {
    setPwSuccess(''); setPwError('');
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setPwSuccess('Password changed.');
      pwForm.reset();
    } catch (err) {
      setPwError(err?.response?.data?.error || 'Failed to change password.');
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      {/* Info card */}
      <div className="card">
        <div className="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center text-white text-xl font-bold">
            {profile?.firstName?.[0]}{profile?.lastName?.[0]}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{profile?.firstName} {profile?.lastName}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <span className="text-xs font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Tenant</span>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><User size={14} /> Personal info</h3>

        {infoSuccess && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3"><CheckCircle size={13} />{infoSuccess}</div>}
        {infoError && <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3"><AlertCircle size={13} />{infoError}</div>}

        <form onSubmit={infoForm.handleSubmit(onInfoSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First name</label><input className="input" {...infoForm.register('firstName', { required: true })} /></div>
            <div><label className="label">Last name</label><input className="input" {...infoForm.register('lastName', { required: true })} /></div>
          </div>
          <div><label className="label">Email</label><input className="input bg-surface-100 cursor-not-allowed" value={user?.email} disabled /></div>
          <div><label className="label">Phone (optional)</label><input className="input" placeholder="(555) 000-0000" {...infoForm.register('phone')} /></div>
          <button type="submit" className="btn-primary" disabled={infoForm.formState.isSubmitting}>
            {infoForm.formState.isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Password card */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Lock size={14} /> Change password</h3>

        {pwSuccess && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3"><CheckCircle size={13} />{pwSuccess}</div>}
        {pwError && <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3"><AlertCircle size={13} />{pwError}</div>}

        <form onSubmit={pwForm.handleSubmit(onPwSubmit)} className="space-y-4">
          <div><label className="label">Current password</label><input type="password" className="input" {...pwForm.register('currentPassword', { required: true })} /></div>
          <div><label className="label">New password</label><input type="password" className="input" {...pwForm.register('newPassword', { required: true, minLength: 6 })} /></div>
          <div><label className="label">Confirm new password</label>
            <input type="password" className="input" {...pwForm.register('confirmPassword', { required: true, validate: (v) => v === newPassword || 'Passwords do not match' })} />
          </div>
          <button type="submit" className="btn-primary" disabled={pwForm.formState.isSubmitting}>
            {pwForm.formState.isSubmitting ? 'Updating...' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TenantPortalPage;
