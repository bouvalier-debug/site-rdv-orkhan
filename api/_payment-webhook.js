const { createManagerClient } = require("./_orkhan-shop-orders");
const { findCheckoutSessionByPaymentIntent, verifyStripeSignature } = require("./_payment/stripe");

const REFUND_EVENTS = new Set(["refund.created", "refund.updated", "refund.failed"]);
const REFUND_STATUSES = {
  pending: "PENDING",
  requires_action: "PENDING",
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  canceled: "CANCELED"
};

async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === "string") return Buffer.from(req.rawBody);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (!req || typeof req[Symbol.asyncIterator] !== "function") throw new Error("raw_body_unavailable");
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function paidPayload(event, session) {
  const payload = {
    provider: "STRIPE",
    providerRef: session.id,
    eventId: event.id,
    amountCents: session.amount_total,
    currency: session.currency.toUpperCase(),
    paidAt: new Date(event.created * 1000).toISOString()
  };
  if (typeof session.payment_intent === "string" && session.payment_intent.trim()) {
    payload.providerPaymentRef = session.payment_intent.trim();
  }
  return payload;
}

function refundPayload(event, refund, session) {
  return {
    provider: "STRIPE",
    eventId: event.id,
    providerRef: session.id,
    providerPaymentRef: refund.payment_intent,
    providerRefundRef: refund.id,
    amountCents: refund.amount,
    currency: refund.currency.toUpperCase(),
    status: REFUND_STATUSES[refund.status],
    occurredAt: new Date(event.created * 1000).toISOString()
  };
}

function validRefund(event, refund) {
  return typeof event?.id === "string" && event.id.trim()
    && Number.isInteger(event.created)
    && typeof refund?.id === "string" && refund.id.trim()
    && Number.isInteger(refund.amount) && refund.amount > 0
    && typeof refund.currency === "string" && refund.currency.trim()
    && Object.hasOwn(REFUND_STATUSES, refund.status)
    && (refund.payment_intent === null || typeof refund.payment_intent === "string");
}

async function processPaymentWebhook(rawBody, signature, options = {}) {
  const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
  const verified = (options.verifySignature || verifyStripeSignature)(
    rawBody, signature, webhookSecret, options.signatureOptions
  );
  if (!verified) return { status: 400, body: { error: "invalid_signature" } };

  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); } catch {
    return { status: 400, body: { error: "invalid_event" } };
  }
  if (REFUND_EVENTS.has(event?.type)) {
    const refund = event?.data?.object;
    if (!validRefund(event, refund)) return { status: 400, body: { error: "invalid_refund_event" } };
    if (!refund.payment_intent?.trim()) return { status: 200, body: { ok: true, outcome: "ignored_unlinked" } };
    const lookup = options.findCheckoutSessionByPaymentIntent || ((paymentIntent) =>
      findCheckoutSessionByPaymentIntent(paymentIntent, options.stripeOptions));
    const sessions = await lookup(refund.payment_intent);
    if (sessions.length === 0) return { status: 200, body: { ok: true, outcome: "ignored_foreign" } };
    if (sessions.length !== 1) throw new Error("stripe_session_lookup_inconsistent");
    const session = sessions[0];
    const reference = session?.client_reference_id;
    if (!reference || session.metadata?.orderReference !== reference) {
      return { status: 200, body: { ok: true, outcome: "ignored_foreign" } };
    }
    if (session.payment_intent !== refund.payment_intent || session.payment_status !== "paid" || typeof session.id !== "string") {
      throw new Error("stripe_session_lookup_inconsistent");
    }
    const manager = options.manager || createManagerClient(options.managerOptions);
    const result = await manager.markRefunded(reference, refundPayload(event, refund, session));
    return { status: 200, body: { ok: true, outcome: result.outcome || "refund_recorded" } };
  }
  if (event?.type !== "checkout.session.completed") {
    return { status: 200, body: { ok: true, outcome: "ignored" } };
  }
  const session = event?.data?.object;
  if (session?.payment_status !== "paid") {
    return { status: 200, body: { ok: true, outcome: "ignored" } };
  }
  const reference = session.client_reference_id;
  if (!reference || session.metadata?.orderReference !== reference
    || typeof session.id !== "string" || !Number.isInteger(session.amount_total)
    || typeof session.currency !== "string" || !Number.isInteger(event.created)) {
    return { status: 400, body: { error: "invalid_paid_event" } };
  }
  const manager = options.manager || createManagerClient(options.managerOptions);
  const result = await manager.markPaid(reference, paidPayload(event, session));
  const status = result.status || result.order?.status;
  return {
    status: 200,
    body: {
      ok: true,
      outcome: status === "REVIEW_REQUIRED" || result.outcome === "amount_mismatch"
        ? "review_required" : result.outcome || "paid"
    }
  };
}

module.exports = { paidPayload, processPaymentWebhook, readRawBody, refundPayload };
