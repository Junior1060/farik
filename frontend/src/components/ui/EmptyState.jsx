import React from 'react';
import { Inbox } from 'lucide-react';

const EmptyState = ({ icon: Icon = Inbox, title = 'Nothing here yet', description, action }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
      <Icon size={28} className="text-slate-400" />
    </div>
    <p className="text-slate-800 font-semibold text-base">{title}</p>
    {description && (
      <p className="text-slate-400 text-sm mt-1.5 max-w-sm leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
