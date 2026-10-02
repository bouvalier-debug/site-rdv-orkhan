const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { processPaymentWebhook, readRawBody } = require("../api/_payment-webhook");
const paymentWebhook = require("../api/payment-webhook");
const { verifyStripeSignature } = require("../api/_payment/stripe");

const SECRET = "whsec_test";
const NOW = 1790953200;

function event(overrides = {}) {
  return {
    id: "evt_test_1", type: "checkout.session.completed", created: NOW,
    data: { object: {
      id: "cs_test_1", payment_status: "paid", amount_total: 2349, currency: "eur",
      client_reference_id: "BOUT-TEST", metadata: { orderReference: "BOUT-TEST" }, ...overrides
    } }
  };
}

function signed(value, timestamp = NOW) {
  const raw = Buffer.from(JSON.stringify(value));
  const signature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
  return { raw, header: `t=${timestamp},v1=${signature}` };
}

test("refuse une signature absente ou invalide", async () => {
  const { raw } = signed(event());
  assert.equal((await processPaymentWebhook(raw, "", { webhookSecret: SECRET })).status, 400);
  assert.equal((await processPaymentWebhook(raw, `t=${NOW},v1=${"0".repeat(64)}`, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW }
  })).status, 400);
});

test("vérifie la signature sur le corps brut exact et refuse un corps transformé", () => {
  const { raw, header } = signed(event());
  assert.equal(verifyStripeSignature(raw, header, SECRET, { nowSeconds: NOW }), true);
  const transformed = Buffer.from(JSON.stringify(JSON.parse(raw.toString()), null, 2));
  assert.equal(verifyStripeSignature(transformed, header, SECRET, { nowSeconds: NOW }), false);
});

test("un paiement valide traduit exclusivement les données Stripe vers Manager", async () => {
  const calls = [];
  const { raw, header } = signed(event());
  const result = await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid(reference, payload) { calls.push({ reference, payload }); return { status: "PAID" }; } }
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "paid" } });
  assert.deepEqual(calls[0], { reference: "BOUT-TEST", payload: {
    provider: "STRIPE", providerRef: "cs_test_1", eventId: "evt_test_1",
    amountCents: 2349, currency: "EUR", paidAt: new Date(NOW * 1000).toISOString()
  } });
});

test("un eventId rejoué est transmis identiquement pour l’idempotence Manager", async () => {
  const calls = [];
  const { raw, header } = signed(event());
  const options = { webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid(reference, payload) { calls.push({ reference, payload }); return { outcome: "already_paid" }; } } };
  await processPaymentWebhook(raw, header, options);
  await processPaymentWebhook(raw, header, options);
  assert.deepEqual(calls[0], calls[1]);
});

test("un écart de montant reste REVIEW_REQUIRED mais est acquitté", async () => {
  const { raw, header } = signed(event({ amount_total: 1 }));
  const result = await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid() { return { status: "REVIEW_REQUIRED", outcome: "amount_mismatch" }; } }
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "review_required" } });
});

test("un événement non pertinent est acquitté sans appeler Manager", async () => {
  const { raw, header } = signed({ ...event(), type: "customer.created" });
  const result = await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid() { assert.fail("Manager ne doit pas être appelé"); } }
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "ignored" } });
});

test("readRawBody conserve exactement les octets et refuse un objet déjà parsé", async () => {
  const raw = Buffer.from("{\n  \"a\": 1\n}");
  assert.strictEqual(await readRawBody({ rawBody: raw }), raw);
  await assert.rejects(() => readRawBody({ body: { a: 1 } }), /raw_body_unavailable/);
});

test("la route webhook refuse immédiatement une signature absente", async () => {
  const response = { setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await paymentWebhook({ method: "POST", headers: {} }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "missing_signature" });
  assert.equal(paymentWebhook.config.api.bodyParser, false);
});
