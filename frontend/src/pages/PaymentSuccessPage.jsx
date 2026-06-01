import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowLeft } from 'lucide-react';

const PaymentSuccessPage = () => (
  <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
    <div className="w-full max-w-md text-center">
      <div className="card">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={32} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment successful</h1>
        <p className="text-slate-500 text-sm mb-6">
          Your rent payment has been processed. A confirmation will appear in your payment history shortly.
        </p>
        <Link to="/tenant?tab=payments" className="btn-primary justify-center w-full py-2.5">
          <ArrowLeft size={15} /> Back to portal
        </Link>
      </div>
      <p className="text-xs text-slate-400 mt-4">Powered by Stripe · Secured with TLS encryption</p>
    </div>
  </div>
);

export default PaymentSuccessPage;
