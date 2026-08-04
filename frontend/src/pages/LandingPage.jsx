import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, MessageSquare, Wrench, Bell, CreditCard, ShieldCheck,
  CheckCircle, ArrowRight, Upload, Phone, Bot, ClipboardList, Eye,
  UserCheck, Lock, ScrollText, Scale,
} from 'lucide-react';
import PilotApplicationForm from '../components/pilot/PilotApplicationForm';

// ── Content ──────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: Upload,
    title: 'Add your properties',
    body: 'Import your tenants, leases, rent amounts, and contact details.',
  },
  {
    icon: Phone,
    title: 'Give tenants one number',
    body: 'Tenants text Farik instead of sending every request to your personal phone.',
  },
  {
    icon: Bot,
    title: 'Farik handles the routine work',
    body: 'Farik organizes requests, sends approved follow-ups, drafts notices, and escalates decisions that need you.',
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
    body: 'Track overdue balances and prepare consistent reminder messages for landlord review.',
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

const PILOT_INCLUDES = [
  'Free for 30 days',
  'Up to 20 units',
  'Personal data import and onboarding',
  'Maintenance request organization',
  'Rent tracking and reminder workflows',
  'Tenant messaging history',
  'Direct founder support',
  'No credit card required',
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
    a: 'Farik is initially designed for independent landlords managing approximately 1–100 units.',
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

// ── Sections ─────────────────────────────────────────────────────────────────

const Logo = ({ size = 'md' }) => (
  <div className="flex items-center gap-2.5">
    <div className={`${size === 'sm' ? 'w-6 h-6 rounded-md' : 'w-8 h-8 rounded-lg'} bg-brand-500 flex items-center justify-center`}>
      <Building2 size={size === 'sm' ? 12 : 16} className="text-white" aria-hidden="true" />
    </div>
    <span className={`${size === 'sm' ? 'text-sm font-semibold text-slate-700' : 'text-xl font-bold text-slate-900'} tracking-tight`}>
      Farik
    </span>
  </div>
);


// ── Page ─────────────────────────────────────────────────────────────────────

const LandingPage = () => (
  <div className="min-h-screen bg-white">
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-white focus:text-slate-900 focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-card-md focus:ring-2 focus:ring-indigo-500"
    >
      Skip to content
    </a>

    {/* Nav */}
    <nav className="border-b border-slate-100 px-4 sticky top-0 bg-white/95 backdrop-blur z-30">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 h-16">
        <Logo />
        <div className="hidden md:flex items-center gap-1">
          <a href="#how-it-works" className="btn-ghost">How it works</a>
          <a href="#features" className="btn-ghost">Features</a>
          <a href="#security" className="btn-ghost">Security</a>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Link to="/login" className="btn-ghost px-2 sm:px-3">Sign in</Link>
          <a href="#pilot" className="btn-primary whitespace-nowrap text-xs px-3 sm:text-sm sm:px-4">
            Apply for pilot
          </a>
        </div>
      </div>
      {/* Anchors move to a scrollable row on small screens rather than a JS menu. */}
      <div className="md:hidden max-w-6xl mx-auto flex items-center gap-1 pb-2 overflow-x-auto">
        <a href="#how-it-works" className="btn-ghost whitespace-nowrap">How it works</a>
        <a href="#features" className="btn-ghost whitespace-nowrap">Features</a>
        <a href="#security" className="btn-ghost whitespace-nowrap">Security</a>
      </div>
    </nav>

    <main id="main">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12 sm:pt-20 text-center" aria-labelledby="hero-title">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-200 mb-6">
          <CheckCircle size={12} aria-hidden="true" />
          Built in Saskatchewan for independent landlords
        </div>
        <h1 id="hero-title" className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
          The AI property manager for landlords with 1–100 units.<br />
          <span className="text-brand-500">Your tenants text. Farik handles the routine work.</span>
        </h1>
        <p className="text-slate-600 text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
          Farik turns tenant texts into organized maintenance requests, rent follow-ups, notices,
          and updates—while keeping you in control.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-8 max-w-md sm:max-w-none mx-auto">
          <a href="#pilot" className="btn-primary text-base px-6 py-3 justify-center">
            Apply for the free pilot <ArrowRight size={16} aria-hidden="true" />
          </a>
          <Link to="/login" className="btn-secondary text-base px-6 py-3 justify-center">
            Explore the demo
          </Link>
        </div>
        <p className="text-sm text-slate-500 mt-5">
          Free for 30 days · Up to 20 units · Personal onboarding · No credit card
        </p>
      </section>

      {/* SMS workflow demonstration */}
      <section id="sms-demo" className="bg-surface-100 py-16 sm:py-20" aria-labelledby="sms-demo-title">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 id="sms-demo-title" className="text-3xl font-bold text-slate-900">One text becomes an organized request</h2>
            <p className="text-slate-600 mt-3">
              An illustration of how a tenant message turns into work you can review.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto">
            {/* Tenant conversation */}
            <figure
              className="bg-slate-900 rounded-[2rem] p-3 shadow-card-lg"
              aria-label="Example conversation — illustration, not a real message"
            >
              <div className="bg-white rounded-[1.6rem] overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-brand-500 rounded-md flex items-center justify-center">
                      <Building2 size={12} className="text-white" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Farik</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    Example
                  </span>
                </div>
                <div className="p-4 space-y-3 bg-surface-50">
                  {DEMO_THREAD.map(({ from, body }, i) => (
                    <div key={i} className={`flex ${from === 'tenant' ? 'justify-end' : 'justify-start'}`}>
                      <p
                        className={`max-w-[85%] text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                          from === 'tenant'
                            ? 'bg-brand-500 text-white rounded-br-md'
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

            {/* Landlord activity card */}
            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ClipboardList size={17} className="text-violet-600" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Maintenance request created</h3>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0">
                  Example
                </span>
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
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16 sm:py-20" aria-labelledby="how-it-works-title">
        <div className="text-center mb-12">
          <h2 id="how-it-works-title" className="text-3xl font-bold text-slate-900">How it works</h2>
          <p className="text-slate-600 mt-3">Three steps from a shoebox of texts to an organized portfolio.</p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </section>

      {/* Features */}
      <section id="features" className="bg-surface-100 py-16 sm:py-20" aria-labelledby="features-title">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 id="features-title" className="text-3xl font-bold text-slate-900">What changes on day one</h2>
            <p className="text-slate-600 mt-3">Built around the work small landlords actually repeat every month.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card hover:shadow-card-md transition-shadow">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={18} className="text-brand-600" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Human control */}
      <section id="control" className="max-w-6xl mx-auto px-4 py-16 sm:py-20" aria-labelledby="control-title">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 id="control-title" className="text-3xl font-bold text-slate-900">Autopilot without losing control.</h2>
            <p className="text-slate-600 mt-4 leading-relaxed">
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

      {/* Founding landlord pilot */}
      <section id="pilot" className="bg-surface-100 py-16 sm:py-20 scroll-mt-20" aria-labelledby="pilot-title">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-200 mb-5">
              Now onboarding
            </div>
            <h2 id="pilot-title" className="text-3xl font-bold text-slate-900">Founding Landlord Pilot</h2>
            <p className="text-slate-600 mt-3 max-w-2xl mx-auto leading-relaxed">
              We are onboarding a small group of independent landlords in Saskatchewan to help shape
              Farik around real property-management workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="card">
              <h3 className="section-title mb-4">What the pilot includes</h3>
              <ul className="space-y-2.5">
                {PILOT_INCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-sm text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-5 pt-4 border-t border-slate-100">
                Prefer to look around first?{' '}
                <Link to="/register" className="text-brand-600 font-medium hover:underline">Create an account →</Link>
              </p>
            </div>

            <div className="card">
              <h3 className="section-title">Apply for the pilot</h3>
              <p className="text-sm text-slate-600 mt-1.5 mb-5 leading-relaxed">
                Tell us a little about your properties. After applying, you can book a short call
                with the Farik team.
              </p>
              <PilotApplicationForm />
            </div>
          </div>
        </div>
      </section>

      {/* Security and trust */}
      <section id="security" className="max-w-6xl mx-auto px-4 py-16 sm:py-20 scroll-mt-20" aria-labelledby="security-title">
        <div className="text-center mb-12">
          <h2 id="security-title" className="text-3xl font-bold text-slate-900">Built so you stay accountable</h2>
          <p className="text-slate-600 mt-3 max-w-2xl mx-auto">
            What Farik does and does not do, stated plainly.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                <Icon size={18} className="text-slate-600" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-surface-100 py-16 sm:py-20" aria-labelledby="faq-title">
        <div className="max-w-3xl mx-auto px-4">
          <h2 id="faq-title" className="text-3xl font-bold text-slate-900 text-center mb-10">
            Common questions
          </h2>
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
        </div>
      </section>
    </main>

    {/* Footer */}
    <footer className="border-t border-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo size="sm" />
        <div className="flex items-center gap-5">
          <Link to="/privacy" className="text-xs text-slate-500 hover:text-slate-700">Privacy</Link>
          <Link to="/terms" className="text-xs text-slate-500 hover:text-slate-700">Terms</Link>
          <Link to="/sms-consent" className="text-xs text-slate-500 hover:text-slate-700">SMS Policy</Link>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} Farik. All rights reserved.</p>
      </div>
    </footer>
  </div>
);

export default LandingPage;
