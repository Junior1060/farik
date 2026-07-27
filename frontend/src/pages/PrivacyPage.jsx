import React from 'react';
import LegalLayout from '../components/legal/LegalLayout';

const PrivacyPage = () => (
  <LegalLayout title="Privacy Policy" updated="July 2026">
    <p>
      Farik ("Farik", "we", "us") provides SMS-based rent collection, maintenance, and notice
      tools for landlords and their tenants. This policy explains what information we collect,
      how we use it, and who we share it with.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Information we collect</h2>
    <ul className="list-disc pl-5 space-y-1.5">
      <li>Account information: name, email, phone number, and company name for landlords who sign up.</li>
      <li>Tenant information: name, phone number, email, unit, and lease details, entered by a landlord or imported from spreadsheets, documents, or images the landlord uploads.</li>
      <li>Message content: the text messages exchanged between Farik, landlords, and tenants, used to deliver rent reminders, maintenance updates, and notices.</li>
      <li>Payment information: rent payment amounts, dates, and status. Card and bank details are handled directly by our payment processor and are not stored on Farik's servers.</li>
      <li>Usage data: log data such as IP address and browser type, used to keep the service secure and reliable.</li>
    </ul>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">How we use information</h2>
    <p>We use the information above to:</p>
    <ul className="list-disc pl-5 space-y-1.5">
      <li>Send and receive SMS messages on behalf of a landlord (rent reminders, late notices, maintenance updates, and general messages).</li>
      <li>Process and record rent payments.</li>
      <li>Operate the landlord dashboard and tenant portal.</li>
      <li>Improve and secure the Farik service.</li>
    </ul>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Who we share it with</h2>
    <p>
      We share information with service providers who help us operate Farik, including our SMS
      provider (Twilio) for sending and receiving text messages, and our payment processor for
      handling rent payments. These providers are only permitted to use the information to
      provide their service to us. We do not sell tenant or landlord information.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Data retention</h2>
    <p>
      We retain account, lease, and payment records for as long as an account is active and as
      needed to meet legal and accounting obligations. A landlord or tenant may request deletion
      of their data by contacting us at the address below, subject to records we're required to
      keep by law.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Your choices</h2>
    <p>
      Tenants can reply <strong>STOP</strong> to any Farik text message to opt out of SMS
      messaging at any time, and <strong>HELP</strong> for assistance. See our{' '}
      <a href="/sms-consent" className="text-brand-600 hover:underline">SMS Policy</a> for details.
    </p>

    <h2 className="text-lg font-semibold text-slate-900 pt-2">Contact us</h2>
    <p>
      Questions about this policy or your data can be sent to{' '}
      <a href="mailto:support@farik.ca" className="text-brand-600 hover:underline">support@farik.ca</a>.
    </p>
  </LegalLayout>
);

export default PrivacyPage;
