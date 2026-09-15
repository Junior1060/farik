import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CreditCard, FileText, Wrench, MessageSquare, Menu, X, Check,
} from 'lucide-react';
import Logo from '../components/marketing/Logo';
import ProductPreview from '../components/marketing/ProductPreview';

// ── Content ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
];

const PROBLEMS = [
  {
    icon: CreditCard,
    title: 'Rent tracking',
    body: 'See who paid, who hasn’t, and what is overdue.',
  },
  {
    icon: FileText,
    title: 'Lease management',
    body: 'Keep lease dates, rent amounts, and tenant information organized.',
  },
  {
    icon: Wrench,
    title: 'Maintenance',
    body: 'Tenants submit issues while you track progress in one place.',
  },
  {
    icon: MessageSquare,
    title: 'Tenant communication',
    body: 'Messages, notices, and property communication stay organized.',
  },
];

const STEPS = [
  {
    title: 'Add your properties',
    body: 'Set up manually or import your existing information.',
  },
  {
    title: 'Add your tenants and leases',
    body: 'Keep everything connected to the correct unit.',
  },
  {
    title: 'Run your rentals from Farik',
    body: 'Track rent, requests, leases, notices, and communication.',
  },
];

const AUDIENCE = [
  'Independent landlords',
  'Small property managers',
  'Owners managing roughly 1–50 units',
];

// ── Nav ──────────────────────────────────────────────────────────────────────

const Nav = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4" aria-label="Main">
        <Logo />

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="btn-ghost text-slate-600 hover:text-slate-900">{label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/login" className="btn-ghost text-slate-700 hover:text-slate-900">Log in</Link>
          <Link to="/signup" className="btn-primary">Get Started</Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="md:hidden p-2 -mr-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </nav>

      <div id="mobile-menu" hidden={!open} className="md:hidden border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="btn-ghost justify-start py-2.5 text-slate-700">{label}</a>
          ))}
          <div className="border-t border-slate-100 my-2" />
          <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary justify-center">Log in</Link>
          <Link to="/signup" onClick={() => setOpen(false)} className="btn-primary justify-center">Get Started</Link>
        </div>
      </div>
    </header>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const LandingPage = () => (
  <div className="min-h-screen bg-white text-slate-900">
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-white focus:text-slate-900 focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-card-md focus:ring-2 focus:ring-indigo-500"
    >
      Skip to content
    </a>

    <Nav />

    <main id="main">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10 sm:pb-14 text-center" aria-labelledby="hero-title">
        <h1 id="hero-title" className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08] max-w-4xl mx-auto">
          Property management without the busywork.
        </h1>
        <p className="text-lg sm:text-xl text-slate-600 mt-6 max-w-2xl mx-auto leading-relaxed">
          Farik helps independent landlords manage tenants, leases, rent, maintenance, notices, and
          communication from one place.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-9 max-w-sm sm:max-w-none mx-auto">
          <Link to="/signup" className="btn-primary text-base px-6 py-3 justify-center">
            Get Started <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <a href="#how-it-works" className="btn-secondary text-base px-6 py-3 justify-center">
            See How It Works
          </a>
        </div>
        <p className="text-sm text-slate-500 mt-5">Built for independent landlords and small property managers.</p>
      </section>

      {/* Product preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28" aria-label="Product preview">
        <ProductPreview />
      </section>

      {/* Problems Farik solves */}
      <section id="features" className="border-t border-slate-100 scroll-mt-20" aria-labelledby="features-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">Everything a rental needs, in one place.</h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">
              The work that usually lives in spreadsheets, text threads, and a folder of PDFs.
            </p>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
            {PROBLEMS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-slate-200 p-6 bg-white">
                <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-5" aria-hidden="true">
                  <Icon size={18} className="text-slate-700" />
                </span>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-surface-50 border-y border-slate-100 scroll-mt-20" aria-labelledby="how-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <h2 id="how-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">How it works</h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">Three steps. No sales call, no setup fee.</p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white text-sm font-semibold mb-5" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="font-semibold text-slate-900">
                  <span className="sr-only">Step {i + 1}: </span>{title}
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <Link to="/signup" className="btn-primary inline-flex">
              Get Started <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="scroll-mt-20" aria-labelledby="who-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <h2 id="who-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Built for landlords who don’t need enterprise software.
            </h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">
              Farik is deliberately simple. No modules to configure, no training sessions, no account
              manager. If you can keep a spreadsheet, you can run Farik.
            </p>
          </div>
          <ul className="space-y-3 lg:pt-2">
            {AUDIENCE.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 px-5 py-4">
                <span className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Check size={13} className="text-emerald-700" />
                </span>
                <span className="text-slate-800 font-medium">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section id="get-started" className="border-t border-slate-100 scroll-mt-20" aria-labelledby="cta-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <h2 id="cta-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">Your rentals. One place.</h2>
          <p className="text-slate-600 text-lg mt-4 max-w-xl mx-auto leading-relaxed">
            Stop managing properties across spreadsheets, texts, email, and paper.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-9 max-w-sm sm:max-w-none mx-auto">
            <Link to="/signup" className="btn-primary text-base px-6 py-3 justify-center">
              Get Started <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/login" className="btn-secondary text-base px-6 py-3 justify-center">
              Log in
            </Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t border-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo size="sm" />
        <nav aria-label="Legal" className="flex items-center gap-5">
          <Link to="/privacy" className="text-xs text-slate-500 hover:text-slate-800">Privacy</Link>
          <Link to="/terms" className="text-xs text-slate-500 hover:text-slate-800">Terms</Link>
          <Link to="/sms-consent" className="text-xs text-slate-500 hover:text-slate-800">SMS Policy</Link>
        </nav>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} Farik. All rights reserved.</p>
      </div>
    </footer>
  </div>
);

export default LandingPage;
