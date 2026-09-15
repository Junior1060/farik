import React from 'react';
import { LayoutDashboard, Users, FileText, CreditCard, Wrench, Bell, MessageSquare, Building2 } from 'lucide-react';

/**
 * A faithful, static rendering of the landlord dashboard for the homepage. Built
 * from the same layout and tokens as the real app — no screenshots, no stock art.
 * Purely decorative for assistive tech; the sr-only caption describes it.
 */

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Building2, label: 'Properties' },
  { icon: Users, label: 'Tenants' },
  { icon: FileText, label: 'Leases' },
  { icon: CreditCard, label: 'Payments' },
  { icon: MessageSquare, label: 'Messages' },
  { icon: Bell, label: 'Notices' },
  { icon: Wrench, label: 'Maintenance' },
];

const STATS = [
  { label: 'Collected this month', value: '$9,150', sub: '6 of 8 paid' },
  { label: 'Overdue', value: '$1,450', sub: '1 tenant', tone: 'text-red-600' },
  { label: 'Occupancy', value: '8 / 9', sub: '1 vacant unit' },
  { label: 'Open requests', value: '2', sub: '1 waiting on you', tone: 'text-amber-600' },
];

const RENT = [
  { tenant: 'Alice Morgan', unit: 'Maple Court · 1A', amount: '$1,450', status: 'Paid', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { tenant: 'James Carter', unit: 'Maple Court · 2B', amount: '$1,300', status: 'Paid', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { tenant: 'Sophia Chen', unit: 'Elm Street House', amount: '$1,450', status: 'Overdue', tone: 'bg-red-50 text-red-700 border-red-200' },
  { tenant: 'Noah Patel', unit: 'Maple Court · 3A', amount: '$1,250', status: 'Due Oct 1', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
];

const REQUESTS = [
  { title: 'Kitchen sink dripping', where: 'Alice Morgan · 1A', status: 'In progress', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { title: 'Furnace filter replacement', where: 'James Carter · 2B', status: 'Scheduled', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
  { title: 'Bedroom window latch', where: 'Sophia Chen · Elm St', status: 'Needs review', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
];

const Pill = ({ tone, children }) => (
  <span className={`inline-flex items-center text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${tone}`}>{children}</span>
);

const ProductPreview = () => (
  <figure className="relative">
    <figcaption className="sr-only">
      Illustration of the Farik dashboard: rent collected this month, overdue balances, occupancy, open
      maintenance requests, and a list of tenants with their payment status.
    </figcaption>

    <div aria-hidden="true" className="rounded-2xl border border-slate-200 bg-white shadow-card-lg overflow-hidden">
      {/* Window chrome */}
      <div className="h-9 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5 px-4">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="ml-3 h-4 w-40 rounded bg-slate-200/70" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden md:flex w-44 flex-col border-r border-slate-100 py-4 px-3 gap-0.5 bg-white">
          <div className="flex items-center gap-2 px-2 mb-4">
            <span className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center"><Building2 size={12} className="text-white" /></span>
            <span className="text-sm font-semibold text-slate-900">Farik</span>
          </div>
          {NAV.map(({ icon: Icon, label, active }) => (
            <div key={label} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}>
              <Icon size={13} className={active ? 'text-slate-900' : 'text-slate-400'} />
              {label}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 bg-surface-50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Dashboard</p>
            <span className="h-7 w-24 rounded-lg bg-slate-900" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">{s.label}</p>
                <p className={`text-base sm:text-lg font-semibold mt-1 ${s.tone || 'text-slate-900'}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">Rent · September</p>
                <span className="text-[10px] text-slate-400">View all</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {RENT.map((r) => (
                  <li key={r.tenant} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 flex items-center justify-center flex-shrink-0">
                      {r.tenant.split(' ').map((n) => n[0]).join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-slate-800 truncate">{r.tenant}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{r.unit}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-800 hidden sm:block">{r.amount}</span>
                    <Pill tone={r.tone}>{r.status}</Pill>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">Maintenance</p>
                <span className="text-[10px] text-slate-400">2 open</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {REQUESTS.map((r) => (
                  <li key={r.title} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-slate-800 truncate">{r.title}</span>
                        <span className="block text-[10px] text-slate-400 truncate">{r.where}</span>
                      </span>
                      <Pill tone={r.tone}>{r.status}</Pill>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </figure>
);

export default ProductPreview;
