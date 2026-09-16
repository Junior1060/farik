import React from 'react';
import ImportWizard from '../components/import/ImportWizard';

/** Import page inside the app shell. The wizard itself is shared with onboarding. */
export default function ImportPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="page-title">Import Properties</h1>
        <p className="text-slate-500 text-sm mt-1">
          Drop in whatever you have — a spreadsheet, PDF, or photo — and Farik sets up your properties, units, and tenants for you.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
