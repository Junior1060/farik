const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../lib/prisma');

const PLATFORM_FEE_PERCENT = 0.01; // 1%

/* ─────────────────────────────────────────
   LANDLORD: Connect Stripe Express account
───────────────────────────────────────── */
const connectAccount = async (req, res, next) => {
  try {
    const landlord = req.user.landlordProfile;
    let stripeAccountId = landlord.stripeAccountId;

    // Create Express account if landlord doesn't have one yet
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          mcc: '6513', // Real estate agents & managers
          product_description: 'Rental property management — rent collection',
        },
        metadata: { landlordId: landlord.id },
      });

      stripeAccountId = account.id;
      await prisma.landlordProfile.update({
        where: { id: landlord.id },
        data: { stripeAccountId },
      });
    }

    // Create onboarding link (fresh link each time — they expire)
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${process.env.FRONTEND_URL}/profile?stripe=refresh`,
      return_url: `${process.env.FRONTEND_URL}/profile?stripe=success`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────
   LANDLORD: Check Stripe connect status
───────────────────────────────────────── */
const getConnectStatus = async (req, res, next) => {
  try {
    const landlord = req.user.landlordProfile;

    if (!landlord.stripeAccountId) {
      return res.json({ connected: false, chargesEnabled: false, detailsSubmitted: false });
    }

    const account = await stripe.accounts.retrieve(landlord.stripeAccountId);
    const chargesEnabled = account.charges_enabled;

    // Keep DB in sync
    if (chargesEnabled !== landlord.stripeConnected) {
      await prisma.landlordProfile.update({
        where: { id: landlord.id },
        data: { stripeConnected: chargesEnabled },
      });
    }

    res.json({
      connected: chargesEnabled,
      chargesEnabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────
   LANDLORD: Dashboard link (manage payouts)
───────────────────────────────────────── */
const getDashboardLink = async (req, res, next) => {
  try {
    const landlord = req.user.landlordProfile;

    if (!landlord.stripeAccountId) {
      return res.status(400).json({ error: 'No Stripe account connected.' });
    }

    const loginLink = await stripe.accounts.createLoginLink(landlord.stripeAccountId);
    res.json({ url: loginLink.url });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────
   TENANT: Create Stripe Checkout Session
───────────────────────────────────────── */
const createCheckoutSession = async (req, res, next) => {
  try {
    const { paymentId } = req.body;
    const tenantProfile = req.user.tenantProfile;

    if (!paymentId) return res.status(400).json({ error: 'paymentId is required.' });

    // Load payment with full context
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        lease: {
          include: {
            unit: {
              include: {
                property: {
                  include: { landlord: true },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found.' });

    // Security: tenant can only pay their own payments
    if (payment.tenantId !== tenantProfile.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (payment.status === 'PAID') {
      return res.status(400).json({ error: 'This payment has already been paid.' });
    }

    const landlord = payment.lease.unit.property.landlord;

    if (!landlord.stripeAccountId || !landlord.stripeConnected) {
      return res.status(400).json({
        error: 'Your landlord has not connected their Stripe account yet. Please ask them to set up payments.',
      });
    }

    const amountCents = Math.round(payment.amount * 100);
    const feeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT);
    const unit = payment.lease.unit;
    const property = unit.property;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `Rent — ${unit.name}`,
              description: `${property.name} · ${property.address}, ${property.city} · Due ${new Date(payment.dueDate).toLocaleDateString('en-CA')}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: landlord.stripeAccountId,
        },
        metadata: {
          paymentId: payment.id,
          leaseId: payment.leaseId,
          tenantId: tenantProfile.id,
          landlordId: landlord.id,
        },
      },
      metadata: {
        paymentId: payment.id,
        leaseId: payment.leaseId,
        tenantId: tenantProfile.id,
        landlordId: landlord.id,
      },
      customer_email: req.user.email,
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/tenant?tab=payments`,
    });

    // Persist session ID so we can match on webhook
    await prisma.payment.update({
      where: { id: paymentId },
      data: { stripeSessionId: session.id },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────
   WEBHOOK: Handle Stripe events
   NOTE: req.body must be raw Buffer here
───────────────────────────────────────── */
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { paymentId, leaseId, tenantId, landlordId } = session.metadata || {};

    if (!paymentId) {
      console.warn('Webhook: checkout.session.completed missing paymentId metadata');
      return res.json({ received: true });
    }

    try {
      const amountPaid = session.amount_total / 100;
      const feeTaken = Math.round(session.amount_total * PLATFORM_FEE_PERCENT) / 100;

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidDate: new Date(),
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
        },
      });

      await prisma.transactionLog.create({
        data: {
          paymentId,
          leaseId,
          tenantId,
          landlordId,
          stripeSessionId: session.id,
          amount: amountPaid,
          fee: feeTaken,
          currency: session.currency || 'cad',
          status: 'completed',
          metadata: session.metadata,
        },
      });

      console.log(`✅ Payment ${paymentId} marked PAID via Stripe session ${session.id}`);
    } catch (err) {
      console.error('Webhook DB error:', err);
      return res.status(500).json({ error: 'Database update failed.' });
    }
  }

  res.json({ received: true });
};

module.exports = { connectAccount, getConnectStatus, getDashboardLink, createCheckoutSession, handleWebhook };
