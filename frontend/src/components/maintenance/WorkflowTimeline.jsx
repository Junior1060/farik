import React from 'react';
import { Bot, User, Wrench, Cog, Clock } from 'lucide-react';
import { formatDateTime } from '../../utils/formatters';

const ACTOR_ICON = {
  AI: Bot,
  LANDLORD: User,
  TENANT: User,
  VENDOR: Wrench,
  SYSTEM: Cog,
};

const ACTOR_LABEL = {
  AI: 'Farik',
  LANDLORD: 'Landlord',
  TENANT: 'Tenant',
  VENDOR: 'Vendor',
  SYSTEM: 'System',
};

function humanizeState(state) {
  if (!state) return null;
  return state.toLowerCase().replace(/_/g, ' ');
}

export default function WorkflowTimeline({ events = [] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-4">
      {events.map((event, i) => {
        const Icon = ACTOR_ICON[event.actorType] || Clock;
        return (
          <div key={event.id || i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center">
                <Icon size={13} className="text-brand-600" />
              </div>
              {i < events.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="pb-4 min-w-0">
              <p className="text-xs text-slate-400">{formatDateTime(event.createdAt)} · {ACTOR_LABEL[event.actorType] || event.actorType}</p>
              <p className="text-sm text-slate-700 mt-0.5">
                {event.fromState ? (
                  <>Moved from <span className="font-medium capitalize">{humanizeState(event.fromState)}</span> to{' '}</>
                ) : 'Started: '}
                <span className="font-medium capitalize">{humanizeState(event.toState)}</span>
              </p>
              {event.reason && <p className="text-xs text-slate-500 mt-1">{event.reason}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
