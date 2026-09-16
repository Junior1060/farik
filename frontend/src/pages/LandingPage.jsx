import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, MessageSquare, Wrench, Bell, CreditCard, ShieldCheck, ArrowRight, Upload, Users, Bot,
  ClipboardList, Eye, UserCheck, Lock, ScrollText, Scale, Menu, X,
} from 'lucide-react';
import Logo from '../components/marketing/Logo';
import ProductPreview from '../components/marketing/ProductPreview';

// ── Content ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#security', label: 'Security' },
];

const STEPS = [
  {
    icon: Upload,
    title: 'Create your account and add your properties',
    body: 'Set up manually or import the spreadsheets, rent rolls, and leases you already have. It takes minutes, not a meeting.',
  },
  {
    icon: Users,
    title: 'Add your tenants and leases',
    body: 'Everything stays connected to the correct unit. Tenants get one number to text instead of your personal phone.',
  },
  {
    icon: Bot,
    title: 'Let Farik handle the routine work',
    body: 'Farik organizes requests, prepares follow-ups and notice drafts, and escalates the decisions that need you.',
  },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Stop answering repetitive tenant texts',
    body: 'Farik responds to routine questions using the property and lease information available to it.',
  },
  {
    icon: Wrench,
    title: 'Turn maintenance texts into organized tickets',
    body: 'Requests are connected to the correct tenant, unit, category, priority, and conversation history.',
  },
  {
    icon: CreditCard,
    title: 'Never forget a rent follow-up',
    body: 'Track overdue balances and prepare consistent reminder messages for your review.',
  },
  {
    icon: Bell,
    title: 'Create professional notices faster',
    body: 'Generate editable notice drafts using tenant, lease, and payment information.',
  },
  {
    icon: ShieldCheck,
    title: 'Stay in control',
    body: 'Require approval before notices, vendor dispatches, payment arrangements, or costly actions.',
  },
  {
    icon: Eye,
    title: 'See exactly what Farik did',
    body: 'Review actions, reasoning, timestamps, status, and any required follow-up.',
  },
];

const CONTROLS = [
  { rule: 'Routine maintenance acknowledgement', value: 'Automatic', tone: 'auto' },
  { rule: 'Rent reminder', value: 'Automatic or approval required', tone: 'auto' },
  { rule: 'Formal notice', value: 'Always requires approval', tone: 'approval' },
  { rule: 'Vendor dispatch above $250', value: 'Always requires approval', tone: 'approval' },
  { rule: 'Payment arrangement', value: 'Always requires approval', tone: 'approval' },
];

// Only claims that are traceable to something the application actually does.
const TRUST_POINTS = [
  {
    icon: UserCheck,
    title: 'You set the approval rules',
    body: 'Autopilot rules decide which routine actions Farik may complete on its own and which are held for you.',
  },
  {
    icon: ShieldCheck,
    title: 'Sensitive actions can require human review',
    body: 'Anything outside your rules is queued for approval instead of being carried out.',
  },
  {
    icon: Lock,
    title: 'Information is scoped to authorized users',
    body: 'Tenant and property records are tied to the landlord account that owns them, and tenants only see their own records.',
  },
  {
    icon: ScrollText,
    title: 'Activity is recorded for review',
    body: 'Automated actions are written to an activity record with what happened, when, and whether approval was required.',
  },
  {
    icon: Scale,
    title: 'Farik is not a substitute for legal advice',
    body: 'Farik prepares drafts from your data. Review anything with legal weight, and consult a professional when it matters.',
  },
];

const FAQ = [
  {
    q: 'Do I need to talk to someone before I can use Farik?',
    a: 'No. Create an account and start right away. Nothing needs to be approved first, and you can import your existing records or set things up by hand.',
  },
  {
    q: 'Do tenants need to download an app?',
    a: 'No. Tenants can primarily communicate through text. The tenant portal is available for records, payments, and account details when needed.',
  },
  {
    q: 'Does Farik send legal notices automatically?',
    a: 'Farik can prepare editable notice drafts. Landlords should review notices before they are sent.',
  },
  {
    q: 'Can I control what Farik does automatically?',
    a: 'Yes. Autopilot rules determine which routine actions Farik can complete and which actions require approval.',
  },
  {
    q: 'Who is Farik for?',
    a: 'Independent landlords and small property managers, typically with 1–100 units, who want organized rentals without enterprise software.',
  },
  {
    q: 'Can Farik replace my current phone number?',
    a: 'Farik is designed to provide tenants with a dedicated communication number, depending on the messaging integration configured for the account.',
  },
];

// The illustrated conversation. Clearly labelled as an example — no message is
// sent, and SMS delivery depends on a messaging integration being configured.
const DEMO_THREAD = [
  { from: 'tenant', body: 'My kitchen sink is leaking.' },
  { from: 'farik', body: 'Is water actively flooding the floor?' },
  { from: 'tenant', body: 'No, but it keeps dripping.' },
  { from: 'farik', body: 'Thanks. I created a maintenance request and notified your landlord. Reference: #1042.' },
];

const DEMO_ACTIVITY = [
  ['Tenant identified', 'Alice Morgan'],
  ['Property', 'Maple Court Apartments, Apt 1A'],
  ['Category', 'Plumbing'],
  ['Priority', 'Non-emergency'],
  ['Follow-up', 'Photo requested'],
  ['Landlord', 'Notified'],
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
        <p className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-200 mb-6">
          The AI property manager for independent landlords
        </p>
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
            See how it works
          </a>
        </div>
        <p className="text-sm text-slate-500 mt-5">
          Create an account and start managing your rentals today. Built for independent landlords and small property managers.
        </p>
      </section>

      {/* Product preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28" aria-label="Product preview">
        <ProductPreview />
      </section>

      {/* SMS workflow demonstration */}
      <section id="sms-demo" className="bg-surface-50 border-y border-slate-100 py-16 sm:py-24" aria-labelledby="sms-demo-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 id="sms-demo-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">One text becomes an organized request</h2>
            <p className="text-slate-600 mt-3 text-lg">An illustration of how a tenant message turns into work you can review.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto">
            <figure className="bg-slate-900 rounded-[2rem] p-3 shadow-card-lg" aria-label="Example conversation — illustration, not a real message">
              <div className="bg-white rounded-[1.6rem] overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                      <Building2 size={12} className="text-white" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Farik</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Example</span>
                </div>
                <div className="p-4 space-y-3 bg-surface-50">
                  {DEMO_THREAD.map(({ from, body }, i) => (
                    <div key={i} className={`flex ${from === 'tenant' ? 'justify-end' : 'justify-start'}`}>
                      <p
                        className={`max-w-[85%] text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                          from === 'tenant'
                            ? 'bg-indigo-600 text-white rounded-br-md'
                            : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'
                        }`}
                      >
                        <span className="sr-only">{from === 'tenant' ? 'Tenant: ' : 'Farik: '}</span>
                        {body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <figcaption className="text-[11px] text-slate-300 text-center pt-2.5 px-3">
                Example conversation. Texting requires a messaging integration on your account.
              </figcaption>
            </figure>

            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ClipboardList size={17} className="text-violet-600" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Maintenance request created</h3>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0">Example</span>
              </div>
              <dl className="divide-y divide-slate-100">
                {DEMO_ACTIVITY.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-xs text-slate-500 flex-shrink-0">{label}</dt>
                    <dd className="text-sm font-medium text-slate-800 text-right">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Eye size={12} aria-hidden="true" />
                Waiting for landlord review
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-20" aria-labelledby="how-it-works-title">
        <div className="max-w-2xl">
          <h2 id="how-it-works-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">How it works</h2>
          <p className="text-slate-600 text-lg mt-4 leading-relaxed">Three steps from a shoebox of texts to an organized portfolio. No sales call, no setup fee.</p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-brand-600" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Step {i + 1}</span>
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <Link to="/signup" className="btn-primary inline-flex">
            Get Started <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-surface-50 border-y border-slate-100 scroll-mt-20" aria-labelledby="features-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">What changes on day one</h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">Built around the work small landlords actually repeat every month.</p>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card hover:shadow-card-md transition-shadow">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={18} className="text-brand-600" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Human control */}
      <section id="control" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28" aria-labelledby="control-title">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 id="control-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">Autopilot without losing control.</h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">
              Choose what Farik can handle automatically and what always requires your approval.
              Every action is recorded in one activity feed.
            </p>
          </div>
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {CONTROLS.map(({ rule, value, tone }) => (
                <li key={rule} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 px-5 py-4">
                  <span className="text-sm font-medium text-slate-800">{rule}</span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap self-start sm:self-auto ${
                      tone === 'approval'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Security and trust */}
      <section id="security" className="bg-surface-50 border-y border-slate-100 scroll-mt-20" aria-labelledby="security-title">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <h2 id="security-title" className="text-3xl sm:text-4xl font-semibold tracking-tight">Built so you stay accountable</h2>
            <p className="text-slate-600 text-lg mt-4 leading-relaxed">What Farik does and does not do, stated plainly.</p>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={18} className="text-slate-600" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-3xl sm:text-4xl font-semibold tracking-tight text-center mb-10">Common questions</h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="card group">
              <summary className="font-semibold text-slate-800 cursor-pointer list-none flex items-center justify-between gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg">
                {q}
                <span className="text-brand-500 text-xl leading-none flex-shrink-0 group-open:rotate-45 transition-transform" aria-hidden="true">+</span>
              </summary>
              <p className="text-sm text-slate-600 leading-relaxed mt-3">{a}</p>
            </details>
          ))}
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
        <p className="text-xs text-slate-500">Built in Saskatchewan · © {new Date().getFullYear()} Farik. All rights reserved.</p>
      </div>
    </footer>
  </div>
);

export default LandingPage;
