import React, { useRef } from 'react';

/**
 * Accessible tab strip. Replaces the two hand-rolled variants that used to live
 * in AgentPage (pill) and TenantPortalPage (underline).
 *
 * @typedef {{ id: string, label: string, count?: number, icon?: React.ComponentType<{size?: number}> }} Tab
 */
const Tabs = ({ tabs, value, onChange, variant = 'pill', ariaLabel = 'Sections', className = '' }) => {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.id === value);
    if (idx === -1) return;
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = tabs[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  const isPill = variant === 'pill';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={
        isPill
          ? `flex gap-1 bg-slate-100 rounded-xl p-1 w-fit max-w-full overflow-x-auto ${className}`
          : `flex gap-0 overflow-x-auto ${className}`
      }
    >
      {tabs.map(({ id, label, count, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            id={`tab-${id}`}
            ref={(el) => { refs.current[id] = el; }}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`tabpanel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={
              isPill
                ? `flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`
                : `flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`
            }
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            {label}
            {count > 0 && (
              <span className="min-w-[18px] h-[18px] inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1 bg-indigo-600 text-white">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/** Panel wrapper that pairs with a Tabs entry of the same id. */
export const TabPanel = ({ id, children, className = '' }) => (
  <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className={className}>
    {children}
  </div>
);

export default Tabs;
