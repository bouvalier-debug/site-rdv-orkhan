process.env.ORKHAN_LEGACY_COSMETICS_FOR_SALE = "true"; // fixture historique : ces tests utilisent cosmetics:* comme colis générique (le refus Artero est testé dans retrait-artero.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { executeCheckout } = require("../api/_checkout");

// Lot 2, correctif de l'étape 7 : échec de création de la session Stripe d'un panier avec des produits du catalogue.
// Échec définitif : réservation libérée par le Manager, nouvelle tentative côté panier. Résultat incertain : stock
// conservé et commande signalée. Paniers historiques : comportement inchangé.
const ENV = { ORKHAN_SHOP_ORDERS_SECRET: "secret-boutique-test" };
const REFERENCE = "BOUT-2026-ABCDEF1234";
const CATALOGUE = [{ reference: "shampoing-test", name: "Shampoing", family: "COLIS", publicPriceCents: 1500, familyPriceCents: null, weightGrams: 300, purchasable: true, maxOrderQuantity: 3 }];

function stripeError(status, message = "stripe_checkout_failed") {
  return Object.assign(new Error(message), status === undefined ? {} : { status });
}

async function run(items, { createCheckout, attach, release, flag, paymentOptions } = {}) {
  const calls = [];
  const options = {
    env: ENV, origin: "https://boutique.test", now: () => new Date("2026-10-17T10:00:00.000Z"),
    listCatalogue: async () => ({ available: true, products: CATALOGUE }),
    manager: {
      async createOrder() { calls.push(["create"]); return { reference: REFERENCE }; },
      async attachPaymentReference(reference, payload) { calls.push(["attach", payload.providerRef]); if (attach) return attach(); return {}; },
      async releaseFailedCheckout(reference, payload) { calls.push(["release", reference, payload]); if (release) return release(); return { operation: "released", released: 1 }; },
      async flagCheckoutCancelUncertain(reference, payload) { calls.push(["flag", reference, payload]); if (flag) return flag(); return { operation: "flagged" }; }
    },
    ...(paymentOptions ? { paymentOptions } : {
      payment: { provider: "STRIPE", async createCheckout() { calls.push(["stripe"]); return createCheckout ? createCheckout() : { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test" }; } }
    })
  };
  const input = {
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items, shipping: { mode: "pickup", pickupTiming: "appointment" },
    customer: { firstName: "Test", lastName: "Echec", email: "echec@dynastiedorkhan.com", phone: "0600000000", country: "FR" },
    legalAcceptance: { version: "cgv-2026-10-21-3", accepted: true }
  };
  let result; let error;
  try { result = await executeCheckout(input, options); } catch (caught) { error = caught; }
  return { result, error, calls };
}

const CATALOGUE_CART = [{ productId: "shampoing-test", quantity: 1 }];
const HISTORIC_CART = [{ productId: "cosmetics:samba", quantity: 1 }];
const quiet = async (action) => { const error = console.error; console.error = () => {}; try { return await action(); } finally { console.error = error; } };

test("refus explicite de Stripe (4xx hors 409) : réservation libérée, nouvelle tentative demandée, aucun signalement", async () => {
  for (const status of [400, 401, 402, 403, 404, 429]) {
    const { result, error, calls } = await run(CATALOGUE_CART, { createCheckout: () => { throw stripeError(status); } });
    assert.equal(error, undefined);
    assert.deepEqual(result, { error: "payment_unavailable", status: 503 });
    assert.deepEqual(calls.map((call) => call[0]), ["create", "stripe", "release"]);
    assert.deepEqual(calls[2], ["release", REFERENCE, { provider: "STRIPE", outcome: "definitive", providerStatus: status }]);
  }
});

test("clé Stripe absente ou Live hors Production : aucune requête envoyée, échec définitif", async () => {
  for (const paymentOptions of [{ secretKey: "sk_live_fake", environment: "preview" }, { secretKey: " ", environment: "preview" }]) {
    const { result, calls } = await run(CATALOGUE_CART, { paymentOptions });
    assert.deepEqual(result, { error: "payment_unavailable", status: 503 });
    assert.deepEqual(calls.map((call) => call[0]), ["create", "release"]);
    assert.equal(calls[1][2].providerStatus, null);
  }
});

test("résultat incertain : stock conservé, commande signalée tout de suite, erreur remontée", async () => {
  const cases = [
    () => { throw new TypeError("fetch failed"); },
    () => { throw stripeError(500); },
    () => { throw stripeError(503); },
    () => { throw stripeError(409); },
    () => { throw stripeError(200); },
    () => { throw stripeError(undefined); }
  ];
  for (const createCheckout of cases) {
    const { result, error, calls } = await run(CATALOGUE_CART, { createCheckout });
    assert.equal(result, undefined);
    assert.ok(error instanceof Error);
    assert.deepEqual(calls.map((call) => call[0]), ["create", "stripe", "flag"]);
    assert.deepEqual(calls[2], ["flag", REFERENCE, { provider: "STRIPE", stage: "creation" }]);
  }
});

test("si le Manager ne répond pas, la réponse au client reste la même et rien n'est libéré à tort", async () => {
  await quiet(async () => {
    const definitive = await run(CATALOGUE_CART, { createCheckout: () => { throw stripeError(401); }, release: () => { throw Object.assign(new Error("down"), { status: 503 }); } });
    assert.deepEqual(definitive.result, { error: "payment_unavailable", status: 503 });
    const uncertain = await run(CATALOGUE_CART, { createCheckout: () => { throw stripeError(502); }, flag: () => { throw Object.assign(new Error("down"), { status: 503 }); } });
    assert.match(uncertain.error.message, /stripe_checkout_failed/);
    assert.equal(uncertain.calls.some((call) => call[0] === "release"), false);
  });
});

test("tentative rejouée sur une commande déjà libérée : rattachement refusé, nouvelle tentative demandée", async () => {
  const { result, calls } = await run(CATALOGUE_CART, { attach: () => { throw Object.assign(new Error("CHECKOUT_FAILED"), { status: 409, response: { error: "CHECKOUT_FAILED" } }); } });
  assert.deepEqual(result, { error: "payment_unavailable", status: 503 });
  assert.deepEqual(calls.map((call) => call[0]), ["create", "stripe", "attach"]);
});

test("paniers historiques : comportement inchangé, aucun appel de libération ni de signalement", async () => {
  for (const createCheckout of [() => { throw stripeError(401); }, () => { throw new TypeError("fetch failed"); }]) {
    const { result, error, calls } = await run(HISTORIC_CART, { createCheckout });
    assert.equal(result, undefined);
    assert.ok(error instanceof Error);
    assert.deepEqual(calls.map((call) => call[0]), ["create", "stripe"]);
  }
  const ok = await run(HISTORIC_CART);
  assert.equal(ok.result.ok, true);
  const otherAttach = await run(HISTORIC_CART, { attach: () => { throw Object.assign(new Error("SHOP_ORDER_UNAVAILABLE"), { status: 503, response: { error: "SHOP_ORDER_UNAVAILABLE" } }); } });
  assert.ok(otherAttach.error instanceof Error);
});

test("le panier repart d'une nouvelle tentative après un refus de paiement", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "cart.js"), "utf8");
  const branch = source.slice(source.indexOf('error.message === "payment_unavailable"'));
  assert.ok(branch.length > 0);
  assert.match(branch.slice(0, 400), /checkoutAttempt = null;/);
  assert.match(branch.slice(0, 400), /aucun montant n’a été débité/);
});
