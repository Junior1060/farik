import React from 'react';
import { AlertCircle } from 'lucide-react';

/** Form-level error banner. Announced to assistive tech via role="alert". */
const FormError = ({ children, className = '' }) => {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 bg-red-50 text-red-800 border border-red-200 px-4 py-3 rounded-xl text-sm leading-relaxed ${className}`}
    >
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
};

export default FormError;
