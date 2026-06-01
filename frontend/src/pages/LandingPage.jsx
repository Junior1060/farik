import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, CreditCard, Wrench, MessageSquare, Bell,
  CheckCircle, ArrowRight, BarChart3
} from 'lucide-react';

const features = [
  { icon: BarChart3, title: 'Dashboard Analytics', description: 'Real-time overview of rent collection, occupancy rates, and property performance.' },
  { icon: CreditCard, title: 'Payment Tracking', description: 'Track paid, pending, and overdue rent. Record payments and view history.' },
  { icon: Users, title: 'Tenant Management', description: 'Manage all your tenants, view profiles, lease details, and payment status.' },
  { icon: Wrench, title: 'Maintenance Requests', description: 'Receive and manage maintenance requests. Track progress from open to resolved.' },
  { icon: Bell, title: 'Late Notices', description: 'Generate professional late rent notices for overdue tenants with one click.' },
  { icon: MessageSquare, title: 'Messaging', description: 'Communicate directly with tenants through a clean in-app messaging system.' },
];

const LandingPage = () => (
  <div className="min-h-screen bg-white">
    {/* Nav */}
    <nav className="border-b border-slate-100 px-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Farik</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-ghost">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </div>
    </nav>

    {/* Hero */}
    <section className="max-w-6xl mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-200 mb-6">
        <CheckCircle size={12} />
        Property management for modern landlords
      </div>
      <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-tight">
        Manage your rentals<br />
        <span className="text-brand-500">without the chaos</span>
      </h1>
      <p className="text-slate-500 text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
        Farik gives small and medium landlords a professional platform to manage tenants,
        track rent, handle maintenance, and communicate — all from one clean dashboard.
      </p>
      <div className="flex items-center justify-center gap-3 mt-8">
        <Link to="/register" className="btn-primary text-base px-6 py-3">
          Start for free <ArrowRight size={16} />
        </Link>
        <Link to="/login" className="btn-secondary text-base px-6 py-3">
          View demo
        </Link>
      </div>
    </section>

    {/* Features */}
    <section className="bg-surface-100 py-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900">Everything you need</h2>
          <p className="text-slate-500 mt-3">Powerful tools built for landlords who want clarity, not complexity.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="card hover:shadow-card-md transition-shadow">
              <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                <Icon size={18} className="text-brand-600" />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>


    {/* Footer */}
    <footer className="border-t border-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-brand-500 rounded-md flex items-center justify-center">
            <Building2 size={12} className="text-white" />
          </div>
          <span className="font-semibold text-slate-700 text-sm">Farik</span>
        </div>
        <p className="text-xs text-slate-400">Built as a full-stack MVP showcase.</p>
      </div>
    </footer>
  </div>
);

export default LandingPage;
