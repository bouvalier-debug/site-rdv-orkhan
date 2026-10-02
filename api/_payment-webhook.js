const { createManagerClient } = require("./_orkhan-shop-orders");
const { verifyStripeSignature } = require("./_payment/stripe");

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
  return {
    provider: "STRIPE",
    providerRef: session.id,
    eventId: event.id,
    amountCents: session.amount_total,
    currency: session.currency.toUpperCase(),
    paidAt: new Date(event.created * 1000).toISOString()
  };
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

module.exports = { paidPayload, processPaymentWebhook, readRawBody };
