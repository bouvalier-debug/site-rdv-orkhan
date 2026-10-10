const crypto = require("node:crypto");

const STRIPE_API_URL = "https://api.stripe.com/v1/checkout/sessions";
const SIGNATURE_TOLERANCE_SECONDS = 300;

function appendLineItem(params, index, line, currency) {
  const prefix = `line_items[${index}]`;
  params.set(`${prefix}[price_data][currency]`, currency.toLowerCase());
  params.set(`${prefix}[price_data][product_data][name]`, line.name);
  params.set(`${prefix}[price_data][unit_amount]`, String(line.unitPriceCents));
  params.set(`${prefix}[quantity]`, String(line.quantity));
}

function checkoutParameters(input) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[0]", "card");
  params.set("client_reference_id", input.orderReference);
  params.set("metadata[orderReference]", input.orderReference);
  params.set("customer_email", input.customerEmail);
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  input.lines.forEach((line, index) => appendLineItem(params, index, line, input.currency));
  if (input.shippingCents > 0) {
    appendLineItem(params, input.lines.length, {
      name: "Livraison",
      quantity: 1,
      unitPriceCents: input.shippingCents
    }, input.currency);
  }
  return params;
}

function createStripeAdapter(options = {}) {
  const secretKey = (options.secretKey || process.env.STRIPE_SECRET_KEY || "").trim();
  const fetchImpl = options.fetch || fetch;
  if (!secretKey) throw new Error("stripe_not_configured");
  return {
    provider: "STRIPE",
    async createCheckout(input) {
      const response = await fetchImpl(options.apiUrl || STRIPE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": input.idempotencyKey
        },
        body: checkoutParameters(input).toString()
      });
      let body;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok || typeof body.id !== "string" || typeof body.url !== "string") {
        const error = new Error("stripe_checkout_failed");
        error.status = response.status;
        error.stripeCode = [body?.error?.type, body?.error?.code].filter(Boolean).join(":") || null;
        throw error;
      }
      return { providerRef: body.id, checkoutUrl: body.url };
    }
  };
}

async function findCheckoutSessionByPaymentIntent(paymentIntent, options = {}) {
  const secretKey = options.secretKey || process.env.STRIPE_SECRET_KEY;
  const fetchImpl = options.fetch || fetch;
  if (!secretKey) throw new Error("stripe_not_configured");
  const url = new URL(options.apiUrl || STRIPE_API_URL);
  url.searchParams.set("payment_intent", paymentIntent);
  url.searchParams.set("limit", "2");
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok || !Array.isArray(body.data)) {
    const error = new Error("stripe_session_lookup_failed");
    error.status = response.status;
    throw error;
  }
  return body.data;
}

function parseSignatureHeader(header) {
  const values = {};
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      (values[key] ||= []).push(value);
    }
  }
  return values;
}

function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left || "") || !/^[a-f0-9]{64}$/i.test(right || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function verifyStripeSignature(rawBody, signatureHeader, secret, options = {}) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) return false;
  const values = parseSignatureHeader(signatureHeader);
  const timestamp = Number(values.t?.[0]);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > tolerance) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
    .digest("hex");
  return (values.v1 || []).some((signature) => safeHexEqual(signature, expected));
}

module.exports = {
  SIGNATURE_TOLERANCE_SECONDS,
  checkoutParameters,
  createStripeAdapter,
  findCheckoutSessionByPaymentIntent,
  parseSignatureHeader,
  verifyStripeSignature
};
