const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { processPaymentWebhook, readRawBody } = require("../api/_payment-webhook");
const paymentWebhook = require("../api/payment-webhook");
const { findCheckoutSessionByPaymentIntent, verifyStripeSignature } = require("../api/_payment/stripe");

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

function refundEvent(status = "succeeded", overrides = {}) {
  return {
    id: "evt_refund_1", type: "refund.updated", created: NOW,
    data: { object: {
      id: "re_test_1", amount: 1234, currency: "eur", status,
      payment_intent: "pi_test_1", ...overrides
    } }
  };
}

function session(overrides = {}) {
  return {
    id: "cs_test_1", payment_intent: "pi_test_1", payment_status: "paid",
    client_reference_id: "BOUT-TEST", metadata: { orderReference: "BOUT-TEST" }, ...overrides
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

test("un paiement valide transmet aussi la référence PaymentIntent", async () => {
  const calls = [];
  const { raw, header } = signed(event({ payment_intent: "pi_test_1" }));
  const result = await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid(reference, payload) { calls.push({ reference, payload }); return { status: "PAID" }; } }
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "paid" } });
  assert.deepEqual(calls[0], { reference: "BOUT-TEST", payload: {
    provider: "STRIPE", providerRef: "cs_test_1", eventId: "evt_test_1",
    amountCents: 2349, currency: "EUR", paidAt: new Date(NOW * 1000).toISOString(),
    providerPaymentRef: "pi_test_1"
  } });
});

test("omet providerPaymentRef quand le PaymentIntent est vide", async () => {
  const calls = [];
  const { raw, header } = signed(event({ payment_intent: "" }));
  await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    manager: { async markPaid(_reference, payload) { calls.push(payload); return { status: "PAID" }; } }
  });
  assert.equal(Object.hasOwn(calls[0], "providerPaymentRef"), false);
});

test("un remboursement valide retrouve la session et appelle Manager avec le payload neutre exact", async () => {
  const calls = [];
  const { raw, header } = signed(refundEvent());
  const result = await processPaymentWebhook(raw, header, {
    webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
    findCheckoutSessionByPaymentIntent: async (value) => { assert.equal(value, "pi_test_1"); return [session()]; },
    manager: { async markRefunded(reference, payload) { calls.push({ reference, payload }); return { outcome: "refund_succeeded" }; } }
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "refund_succeeded" } });
  assert.deepEqual(calls[0], { reference: "BOUT-TEST", payload: {
    provider: "STRIPE", eventId: "evt_refund_1", providerRef: "cs_test_1",
    providerPaymentRef: "pi_test_1", providerRefundRef: "re_test_1",
    amountCents: 1234, currency: "EUR", status: "SUCCEEDED",
    occurredAt: new Date(NOW * 1000).toISOString()
  } });
});

test("traduit les cinq statuts Stripe vers quatre statuts neutres", async () => {
  const expected = { pending: "PENDING", requires_action: "PENDING", succeeded: "SUCCEEDED", failed: "FAILED", canceled: "CANCELED" };
  for (const [stripeStatus, neutralStatus] of Object.entries(expected)) {
    const { raw, header } = signed(refundEvent(stripeStatus));
    let received;
    await processPaymentWebhook(raw, header, {
      webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
      findCheckoutSessionByPaymentIntent: async () => [session()],
      manager: { async markRefunded(_reference, payload) { received = payload.status; return {}; } }
    });
    assert.equal(received, neutralStatus);
  }
});

test("refuse un objet Refund invalide et ignore un remboursement sans PaymentIntent", async () => {
  let { raw, header } = signed(refundEvent("unknown"));
  assert.deepEqual(await processPaymentWebhook(raw, header, { webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW } }),
    { status: 400, body: { error: "invalid_refund_event" } });
  ({ raw, header } = signed(refundEvent("succeeded", { payment_intent: null })));
  assert.deepEqual(await processPaymentWebhook(raw, header, { webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW } }),
    { status: 200, body: { ok: true, outcome: "ignored_unlinked" } });
});

test("ignore les remboursements étrangers sans appeler Manager", async () => {
  for (const sessions of [[], [session({ client_reference_id: null })], [session({ metadata: { orderReference: "AUTRE" } })]]) {
    const { raw, header } = signed(refundEvent());
    const result = await processPaymentWebhook(raw, header, {
      webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW },
      findCheckoutSessionByPaymentIntent: async () => sessions,
      manager: { async markRefunded() { assert.fail("Manager ne doit pas être appelé"); } }
    });
    assert.equal(result.body.outcome, "ignored_foreign");
  }
});

test("les incohérences de session et erreurs Manager restent des erreurs afin que Stripe retente", async () => {
  const { raw, header } = signed(refundEvent());
  const base = { webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW } };
  await assert.rejects(() => processPaymentWebhook(raw, header, { ...base, findCheckoutSessionByPaymentIntent: async () => [session(), session({ id: "cs_2" })] }));
  await assert.rejects(() => processPaymentWebhook(raw, header, { ...base, findCheckoutSessionByPaymentIntent: async () => [session({ payment_intent: "pi_other" })] }));
  await assert.rejects(() => processPaymentWebhook(raw, header, { ...base, findCheckoutSessionByPaymentIntent: async () => [session()], manager: { async markRefunded() { throw new Error("manager_error"); } } }));
});

test("la recherche Stripe encode le PaymentIntent, limite à deux sessions et rejette les erreurs API", async () => {
  let request;
  const sessions = await findCheckoutSessionByPaymentIntent("payment opaque", {
    secretKey: "secret-test",
    fetch: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ data: [session()] }) }; }
  });
  const url = new URL(request.url);
  assert.equal(url.searchParams.get("payment_intent"), "payment opaque");
  assert.equal(url.searchParams.get("limit"), "2");
  assert.equal(request.options.headers.Authorization, "Bearer secret-test");
  assert.equal(sessions.length, 1);
  await assert.rejects(() => findCheckoutSessionByPaymentIntent("payment", {
    secretKey: "secret-test", fetch: async () => ({ ok: false, status: 401, json: async () => ({}) })
  }), /stripe_session_lookup_failed/);
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
