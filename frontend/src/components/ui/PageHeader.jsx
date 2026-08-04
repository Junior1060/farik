import React from 'react';

const PageHeader = ({ title, description, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-7">
    <div className="min-w-0">
      <h1 className="page-title">{title}</h1>
      {description && <p className="text-slate-600 text-sm mt-1">{description}</p>}
    </div>
    {action && <div className="sm:flex-shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
