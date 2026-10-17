const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { processPaymentWebhook } = require("../api/_payment-webhook");
const { createManagerClient } = require("../api/_orkhan-shop-orders");

// Lot 2, étape 5 : relais de checkout.session.expired vers le Manager, après vérification de la signature Stripe.
const SECRET = "whsec_test";
const NOW = 1790953200;

function expiredEvent(overrides = {}, eventOverrides = {}) {
  return {
    id: "evt_expired_1", type: "checkout.session.expired", created: NOW,
    data: { object: {
      id: "cs_test_1", status: "expired", payment_status: "unpaid", amount_total: 3000, currency: "eur",
      client_reference_id: "BOUT-TEST", metadata: { orderReference: "BOUT-TEST" }, ...overrides
    } },
    ...eventOverrides
  };
}

function signed(value, timestamp = NOW) {
  const raw = Buffer.from(JSON.stringify(value));
  const signature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
  return { raw, header: `t=${timestamp},v1=${signature}` };
}

function recordingManager(result = { operation: "recorded", released: 1 }) {
  const calls = [];
  return {
    calls,
    manager: {
      async markCheckoutExpired(reference, payload) { calls.push({ reference, payload }); return result; },
      async markPaid() { assert.fail("markPaid ne doit pas être appelé"); }
    }
  };
}

function options(manager) {
  return { webhookSecret: SECRET, signatureOptions: { nowSeconds: NOW }, manager };
}

test("une session expirée authentifiée est relayée au Manager avec un payload neutre", async () => {
  const { calls, manager } = recordingManager();
  const { raw, header } = signed(expiredEvent());
  const result = await processPaymentWebhook(raw, header, options(manager));
  assert.deepEqual(result, { status: 200, body: { ok: true, outcome: "recorded" } });
  assert.deepEqual(calls, [{ reference: "BOUT-TEST", payload: {
    provider: "STRIPE", providerRef: "cs_test_1", eventId: "evt_expired_1", expiredAt: new Date(NOW * 1000).toISOString()
  } }]);
});

test("aucune expiration n'est acceptée sans signature valide", async () => {
  const { calls, manager } = recordingManager();
  const { raw, header } = signed(expiredEvent());
  assert.deepEqual(await processPaymentWebhook(raw, "", options(manager)), { status: 400, body: { error: "invalid_signature" } });
  assert.deepEqual(await processPaymentWebhook(raw, header.replace(/v1=[0-9a-f]+/, `v1=${"0".repeat(64)}`), options(manager)), { status: 400, body: { error: "invalid_signature" } });
  const tampered = Buffer.from(raw.toString().replace("unpaid", "paid"));
  assert.equal((await processPaymentWebhook(tampered, header, options(manager))).status, 400);
  const late = signed(expiredEvent(), NOW - 3600);
  assert.equal((await processPaymentWebhook(late.raw, late.header, options(manager))).status, 400);
  assert.equal(calls.length, 0);
});

test("une session au statut de paiement incertain n'est jamais relayée : le stock reste bloqué", async () => {
  for (const paymentStatus of ["paid", "no_payment_required", undefined, "unknown"]) {
    const { calls, manager } = recordingManager();
    const { raw, header } = signed(expiredEvent({ payment_status: paymentStatus }));
    assert.deepEqual(await processPaymentWebhook(raw, header, options(manager)), { status: 200, body: { ok: true, outcome: "ignored_uncertain" } });
    assert.equal(calls.length, 0, String(paymentStatus));
  }
});

test("une session étrangère à la Boutique est acquittée sans appel au Manager", async () => {
  for (const overrides of [{ client_reference_id: null }, { metadata: {} }, { metadata: { orderReference: "BOUT-AUTRE" } }]) {
    const { calls, manager } = recordingManager();
    const { raw, header } = signed(expiredEvent(overrides));
    assert.deepEqual(await processPaymentWebhook(raw, header, options(manager)), { status: 200, body: { ok: true, outcome: "ignored_foreign" } });
    assert.equal(calls.length, 0);
  }
});

test("un événement d'expiration incohérent est refusé", async () => {
  for (const [overrides, eventOverrides] of [[{ status: "open" }, {}], [{ status: "complete" }, {}], [{ id: "" }, {}], [{}, { id: "" }], [{}, { created: "hier" }]]) {
    const { calls, manager } = recordingManager();
    const { raw, header } = signed(expiredEvent(overrides, eventOverrides));
    assert.deepEqual(await processPaymentWebhook(raw, header, options(manager)), { status: 400, body: { error: "invalid_expired_event" } });
    assert.equal(calls.length, 0);
  }
});

test("rejeu : le même événement est retransmis à l'identique ; une erreur Manager fait retenter Stripe", async () => {
  const { calls, manager } = recordingManager({ operation: "already_recorded", released: 0 });
  const { raw, header } = signed(expiredEvent());
  assert.equal((await processPaymentWebhook(raw, header, options(manager))).body.outcome, "already_recorded");
  await processPaymentWebhook(raw, header, options(manager));
  assert.deepEqual(calls[0], calls[1]);
  const failing = { async markCheckoutExpired() { throw Object.assign(new Error("SHOP_ORDER_UNAVAILABLE"), { status: 503 }); } };
  await assert.rejects(processPaymentWebhook(raw, header, options(failing)));
});

test("le client Manager appelle la route checkout-expired avec le secret de la Boutique", async () => {
  const requests = [];
  const client = createManagerClient({
    baseUrl: "https://manager.example/", secret: "secret-boutique",
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ ok: true, operation: "recorded" }) }; }
  });
  await client.markCheckoutExpired("BOUT-TEST", { provider: "STRIPE" });
  assert.equal(requests[0].url, "https://manager.example/api/shop-orders/BOUT-TEST/checkout-expired");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["X-Orkhan-Shop-Orders-Secret"], "secret-boutique");
  assert.deepEqual(JSON.parse(requests[0].init.body), { provider: "STRIPE" });
});
