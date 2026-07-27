import React from 'react';
import LegalLayout from '../components/legal/LegalLayout';

const SmsConsentPage = () => (
  <LegalLayout title="SMS Policy" updated="July 2026">
    <p>
      Farik is an SMS-first property management platform. This policy explains how text
      messaging works between Farik, Landlords, and Tenants.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">What messages you'll receive</h2>
    <p>
      If you're a Tenant, your Landlord uses Farik to text you about things like rent reminders
      and receipts, maintenance request updates, lease notices, and general messages from your
      Landlord. Message frequency varies based on your Landlord's activity and your lease — for
      most Tenants this is a few messages per month, more if there's an active maintenance
      request or a rent issue.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Consent</h2>
    <p>
      A Tenant's phone number is added to Farik by their Landlord as part of setting up a lease.
      By providing a Tenant's phone number to Farik, a Landlord confirms they have the Tenant's
      consent to be contacted by Farik on the Landlord's behalf. A Tenant who replies to a Farik
      text message is also confirming their consent to receive messages at that number.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Message and data rates</h2>
    <p>
      Message and data rates may apply, depending on your mobile carrier and plan. Farik does not
      charge for text messages beyond your carrier's standard rates.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Opting out</h2>
    <p>
      Reply <strong>STOP</strong> to any message from Farik at any time to stop receiving text
      messages. You'll receive one confirmation message, and then no further messages until you
      text <strong>START</strong> to resume. Reply <strong>HELP</strong> for help, or contact your
      Landlord directly. Opting out of SMS does not end your lease or change your rent
      obligations — talk to your Landlord about alternate ways to stay in touch.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Carriers</h2>
    <p>
      Carriers are not liable for delayed or undelivered messages. Supported carriers may change
      without notice.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Contact us</h2>
    <p>
      Questions about text messaging from Farik can be sent to{' '}
      <a href="mailto:support@farik.ca" className="text-brand-600 hover:underline">support@farik.ca</a>.
      See also our <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a> and{' '}
      <a href="/terms" className="text-brand-600 hover:underline">Terms of Service</a>.
    </p>
  </LegalLayout>
);

export default SmsConsentPage;
