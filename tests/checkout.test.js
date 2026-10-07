const test = require("node:test");
const assert = require("node:assert/strict");
const { executeCheckout } = require("../api/_checkout");
const { checkoutParameters, createStripeAdapter } = require("../api/_payment/stripe");
const { createManagerClient } = require("../api/_orkhan-shop-orders");
const { quoteCartRequest } = require("../api/cart-quote");

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174000";
const CUSTOMER = {
  firstName: "David", lastName: "Test", email: "david@example.test", phone: "0600000000",
  address: "1 rue Test", addressExtra: "", postalCode: "59000", city: "Lille", country: "FR"
};

function checkoutInput(overrides = {}) {
  return {
    checkoutAttemptId: ATTEMPT,
    items: [{ productId: "animoco", quantity: 1, unitPriceCents: 1, totalCents: 1 }],
    shipping: { mode: "animoco-light-fr", priceCents: 1 },
    customer: CUSTOMER,
    legalAcceptance: { version: "cgv-2026-10-05", accepted: true },
    totalCents: 1,
    ...overrides
  };
}

function dependencies(overrides = {}) {
  const calls = [];
  const manager = {
    async createOrder(payload, key) {
      calls.push(["create", payload, key]);
      return { reference: "BOUT-TEST" };
    },
    async attachPaymentReference(reference, payload) {
      calls.push(["attach", reference, payload]);
      return { status: "PENDING_PAYMENT" };
    }
  };
  const payment = {
    provider: "STRIPE",
    async createCheckout(payload) {
      calls.push(["stripe", payload]);
      return { providerRef: "cs_test_123", checkoutUrl: "https://checkout.stripe.test/session" };
    }
  };
  return { calls, manager, payment, origin: "https://boutique.test", ...overrides };
}

test("recalcule le prix serveur et crée la commande Manager avant Stripe", async () => {
  const deps = dependencies();
  const result = await executeCheckout(checkoutInput(), deps);
  assert.deepEqual(result, {
    ok: true, orderReference: "BOUT-TEST", checkoutUrl: "https://checkout.stripe.test/session"
  });
  assert.deepEqual(deps.calls.map((call) => call[0]), ["create", "stripe", "attach"]);
  assert.equal(deps.calls[0][1].lines[0].unitPriceCents, 1999);
  assert.equal(deps.calls[0][1].shippingCents, 350);
  assert.equal(deps.calls[0][1].totalCents, 2349);
  assert.equal(deps.calls[0][1].legalVersion, "cgv-2026-10-05");
  assert.match(deps.calls[0][1].legalAcceptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(deps.calls[1][1].lines[0].unitPriceCents, 1999);
  assert.equal(deps.calls[1][1].shippingCents, 350);
  assert.equal(deps.calls[1][1].orderReference, "BOUT-TEST");
  assert.equal(deps.calls[1][1].idempotencyKey, ATTEMPT);
  assert.deepEqual(deps.calls[2][2], { provider: "STRIPE", providerRef: "cs_test_123" });
});

test("recalcule l’éligibilité Famille et ne transmet jamais la puce", async () => {
  const deps = dependencies({
    verifyFamilyChip: async () => ({ status: "ok", recognized: true })
  });
  const input = checkoutInput({
    items: [{ productId: "animoco", quantity: 1, options: {
      chipNumber: "250 123 456 789 012", familyEligible: false
    } }]
  });
  await executeCheckout(input, deps);
  assert.equal(deps.calls[0][1].dynastieFamilyEligible, true);
  assert.equal(deps.calls[0][1].totalCents, 2149);
  assert.doesNotMatch(JSON.stringify(deps.calls), /250 123 456 789 012|chipNumber/);
});

test("cart-quote et checkout partagent exactement la résolution Famille", async () => {
  const verifyFamilyChip = async () => ({ status: "ok", recognized: true });
  const items = [{ productId: "animoco", quantity: 1, options: { chipNumber: "250123456789012" } }];
  const quote = await quoteCartRequest({ items, shipping: { mode: "animoco-light-fr" } }, { verifyFamilyChip });
  const deps = dependencies({ verifyFamilyChip });
  await executeCheckout(checkoutInput({ items }), deps);
  assert.equal(quote.quote.totalCents, deps.calls[0][1].totalCents);
});

test("refuse une livraison indisponible avant toute création externe", async () => {
  const deps = dependencies();
  const result = await executeCheckout(checkoutInput({
    items: [{ productId: "cosmetics:block", quantity: 1 }],
    shipping: { mode: "mondial-relay-home", address: {
      line1: "1 rue Test", postalCode: "59000", city: "Lille", country: "FR"
    } }
  }), deps);
  assert.equal(result.error, "shipping_unavailable");
  assert.deepEqual(deps.calls, []);
});

test("un colis sans grille reste commandable uniquement en retrait", async () => {
  const deps = dependencies();
  const result = await executeCheckout(checkoutInput({
    items: [{ productId: "cosmetics:block", quantity: 1 }],
    shipping: { mode: "pickup" },
    customer: { firstName: "David", lastName: "Test", email: "david@example.test", phone: "0600000000" }
  }), deps);
  assert.equal(result.ok, true);
  assert.equal(deps.calls[0][1].shippingCents, 0);
});

test("une erreur Stripe laisse seulement la commande PENDING sans rattachement", async () => {
  const deps = dependencies({ payment: {
    provider: "STRIPE",
    async createCheckout() { deps.calls.push(["stripe"]); throw new Error("stripe_checkout_failed"); }
  } });
  await assert.rejects(() => executeCheckout(checkoutInput(), deps), /stripe_checkout_failed/);
  assert.deepEqual(deps.calls.map((call) => call[0]), ["create", "stripe"]);
});

test("une erreur de rattachement ne retourne aucune URL Checkout", async () => {
  const deps = dependencies();
  deps.manager.attachPaymentReference = async () => { deps.calls.push(["attach"]); throw new Error("attach_failed"); };
  await assert.rejects(() => executeCheckout(checkoutInput(), deps), /attach_failed/);
  assert.deepEqual(deps.calls.map((call) => call[0]), ["create", "stripe", "attach"]);
});

test("un rejeu conserve les mêmes clés Manager et Stripe", async () => {
  const deps = dependencies();
  await executeCheckout(checkoutInput(), deps);
  await executeCheckout(checkoutInput(), deps);
  assert.deepEqual(deps.calls.filter((call) => call[0] === "create").map((call) => call[2]), [ATTEMPT, ATTEMPT]);
  assert.deepEqual(deps.calls.filter((call) => call[0] === "stripe").map((call) => call[1].idempotencyKey),
    [ATTEMPT, ATTEMPT]);
});

test("refuse un consentement juridique absent ou d'une version obsolète", async () => {
  const missing = dependencies();
  assert.equal((await executeCheckout(checkoutInput({ legalAcceptance: undefined }), missing)).error, "legal_acceptance_required");
  assert.deepEqual(missing.calls, []);
  const old = dependencies();
  assert.equal((await executeCheckout(checkoutInput({ legalAcceptance: { version: "ancienne", accepted: true } }), old)).error, "legal_version_outdated");
  assert.deepEqual(old.calls, []);
});

test("ignore tout horodatage juridique envoyé par le navigateur", async () => {
  const deps = dependencies({ now: () => new Date("2026-10-06T12:00:00.000Z") });
  await executeCheckout(checkoutInput({ legalAcceptedAt: "2000-01-01T00:00:00.000Z", legalAcceptance: { version: "cgv-2026-10-05", accepted: true, acceptedAt: "2000-01-01T00:00:00.000Z" } }), deps);
  assert.equal(deps.calls[0][1].legalAcceptedAt, "2026-10-06T12:00:00.000Z");
});

test("une Red Dingo exige la confirmation de gravure", async () => {
  const deps = dependencies();
  const result = await executeCheckout(checkoutInput({
    items: [{ productId: "red-dingo:01-DR", quantity: 1, options: { size: "M", colour: "", frontLines: ["NALA"] } }],
    shipping: { mode: "red-dingo-free" }
  }), deps);
  assert.equal(result.error, "engraving_confirmation_required");
  assert.deepEqual(deps.calls, []);
});

test("l’adaptateur Stripe envoie un total exact, une metadata minimale et une clé d’idempotence", async () => {
  let request;
  const adapter = createStripeAdapter({ secretKey: "sk_test_fake", fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.test/session" }) };
  } });
  await adapter.createCheckout({
    idempotencyKey: ATTEMPT, orderReference: "BOUT-TEST", currency: "EUR",
    lines: [{ name: "Animoco", unitPriceCents: 1999, quantity: 1 }], shippingCents: 350,
    customerEmail: "david@example.test", successUrl: "https://boutique.test/success",
    cancelUrl: "https://boutique.test/cancel"
  });
  const params = new URLSearchParams(request.options.body);
  assert.equal(request.options.headers["Idempotency-Key"], ATTEMPT);
  assert.equal(params.get("client_reference_id"), "BOUT-TEST");
  assert.equal(params.get("metadata[orderReference]"), "BOUT-TEST");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1999");
  assert.equal(params.get("line_items[1][price_data][unit_amount]"), "350");
  assert.equal(params.get("payment_method_types[0]"), "card");
  assert.doesNotMatch(request.options.body, /chip|phone|address|snapshot/i);
});

test("les paramètres Stripe ne contiennent jamais de données arbitraires de ligne", () => {
  const params = checkoutParameters({ orderReference: "BOUT-TEST", customerEmail: "d@example.test",
    successUrl: "https://b.test/s", cancelUrl: "https://b.test/c", currency: "EUR", shippingCents: 0,
    lines: [{ name: "Médaille", quantity: 1, unitPriceCents: 1695, options: { chipNumber: "secret" } }] });
  assert.doesNotMatch(params.toString(), /secret|chipNumber/);
});

test("le client Manager applique le secret, l’idempotence et les trois routes exactes", async () => {
  const requests = [];
  const manager = createManagerClient({ baseUrl: "https://manager.test/base", secret: "shop-secret",
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ reference: "BOUT-TEST" }) };
    } });
  await manager.createOrder({ totalCents: 2349 }, ATTEMPT);
  await manager.attachPaymentReference("BOUT-TEST", { provider: "STRIPE", providerRef: "cs_test_1" });
  await manager.markPaid("BOUT-TEST", { eventId: "evt_test_1" });
  assert.deepEqual(requests.map((request) => [request.options.method, new URL(request.url).pathname]), [
    ["POST", "/base/api/shop-orders"],
    ["PUT", "/base/api/shop-orders/BOUT-TEST/payment-reference"],
    ["POST", "/base/api/shop-orders/BOUT-TEST/paid"]
  ]);
  assert.equal(requests[0].options.headers["X-Orkhan-Shop-Orders-Secret"], "shop-secret");
  assert.equal(requests[0].options.headers["Idempotency-Key"], ATTEMPT);
});
