import React from 'react';

const PageHeader = ({ title, description, action }) => (
  <div className="flex items-start justify-between gap-4 mb-7">
    <div>
      <h1 className="page-title">{title}</h1>
      {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
