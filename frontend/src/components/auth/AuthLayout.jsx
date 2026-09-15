import React from 'react';
import Logo from '../marketing/Logo';

/**
 * Centered single-card layout shared by /login and /signup. Deliberately plain:
 * a logo, a heading, the form, one footer line.
 */
const AuthLayout = ({ title, subtitle, children, footer }) => (
  <div className="min-h-screen bg-white flex flex-col">
    <header className="px-4 sm:px-6 h-16 flex items-center max-w-6xl w-full mx-auto">
      <Logo />
    </header>

    <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-6 sm:pt-0">
      <div className="w-full max-w-[420px]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-slate-600 text-sm mt-1.5 leading-relaxed">{subtitle}</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-card">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </main>
  </div>
);

export default AuthLayout;
