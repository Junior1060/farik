import React from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';

const LegalLayout = ({ title, updated, children }) => (
  <div className="min-h-screen bg-white">
    <nav className="border-b border-slate-100 px-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Farik</span>
        </Link>
        <Link to="/" className="btn-ghost">Back to home</Link>
      </div>
    </nav>

    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="text-sm text-slate-400 mt-2">Last updated: {updated}</p>
      <div className="prose-legal mt-8 space-y-6 text-slate-600 leading-relaxed">
        {children}
      </div>
    </div>
  </div>
);

export default LegalLayout;
