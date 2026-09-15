import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Upload, ArrowRight } from 'lucide-react';

/**
 * Shown on the dashboard while the account has no units yet, so a new landlord
 * always has a clear next step instead of a page of zeros.
 */
const GettingStartedPanel = () => (
  <section className="card" aria-labelledby="getting-started-title">
    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1.5">Get started</p>
        <h2 id="getting-started-title" className="text-lg font-semibold text-slate-900 tracking-tight">Set up your first property</h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-xl">
          Add a property and its units, then add tenants and leases. Rent tracking, maintenance, notices,
          and messages all connect to them. You can also import what you already have.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
        <Link to="/onboarding" className="btn-primary justify-center">
          <Building2 size={16} aria-hidden="true" /> Add a property
        </Link>
        <Link to="/import" className="btn-secondary justify-center">
          <Upload size={16} aria-hidden="true" /> Import data <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  </section>
);

export default GettingStartedPanel;
