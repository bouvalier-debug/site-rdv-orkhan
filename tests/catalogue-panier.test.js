const test = require("node:test");
const assert = require("node:assert/strict");
const { cartCatalog, catalogueCartProduct } = require("../api/_cart-catalogue");
const { quoteCartRequest } = require("../api/cart-quote");
const { CATALOGUE_CHECKOUT_EXPIRY_SECONDS, executeCheckout } = require("../api/_checkout");
const { checkoutParameters, createStripeAdapter } = require("../api/_payment/stripe");
const { catalogueLine } = require("../assets/product-cart");

// Lot 2, étape 4 : produits du catalogue Manager dans le panier, le devis, la commande et Stripe (mode test).
const SHAMPOING = { reference: "shampoing-test", name: "Shampoing doux", family: "COLIS", publicPriceCents: 1500, familyPriceCents: 1200, weightGrams: 300, purchasable: true, maxOrderQuantity: 3 };
const BROSSE = { reference: "brosse-test", name: "Brosse", family: "COLIS", publicPriceCents: 900, familyPriceCents: null, weightGrams: 120, purchasable: true, maxOrderQuantity: 0 };
const GAMELLE = { reference: "gamelle-test", name: "Gamelle", family: "COLIS", publicPriceCents: 1100, familyPriceCents: null, weightGrams: 400, purchasable: false, maxOrderQuantity: 0 };
const CHIP = "250269812345678";

function catalogueSource(products = [SHAMPOING, BROSSE, GAMELLE], available = true) {
  const calls = [];
  return { calls, listCatalogue: async () => { calls.push("list"); return available ? { available: true, products } : { available: false, products: [] }; } };
}

function quote(items, extra = {}) {
  const source = extra.source || catalogueSource();
  return quoteCartRequest({ items, shipping: extra.shipping }, {
    listCatalogue: source.listCatalogue,
    verifyFamilyChip: async () => ({ status: "ok", recognized: extra.family === true })
  });
}

test("un panier Animoco ou Red Dingo n'interroge pas le catalogue Manager ; un panier cosmétiques l'interroge seulement pour la bascule Artero (phase 7) et garde ses prix historiques", async () => {
  const source = catalogueSource();
  const animoco = await quoteCartRequest({ items: [{ productId: "animoco", quantity: 1 }] }, { listCatalogue: source.listCatalogue });
  assert.equal(source.calls.length, 0);
  assert.equal(animoco.quote.lines[0].unitPriceCents, 1999);
  const result = await quoteCartRequest({ items: [{ productId: "animoco", quantity: 1 }, { productId: "cosmetics:samba", quantity: 1 }] }, { listCatalogue: source.listCatalogue });
  assert.deepEqual(result.quote.lines.map((line) => [line.productId, line.unitPriceCents]), [["animoco", 1999], ["cosmetics:samba", 1145]]);
  assert.ok(result.quote.availableShippingModes.length >= 1);
});

test("un produit achetable du catalogue est chiffré au prix du Manager, en retrait sur place uniquement", async () => {
  const result = await quote([{ productId: "shampoing-test", quantity: 2 }], { shipping: { mode: "pickup", pickupTiming: "appointment" } });
  assert.deepEqual(result.quote.lines.map((line) => [line.productId, line.name, line.unitPriceCents, line.subtotalCents]), [["shampoing-test", "Shampoing doux", 1500, 3000]]);
  assert.deepEqual(result.quote.availableShippingModes, ["pickup"]);
  assert.equal(result.quote.shipping.priceCents, 0);
  assert.equal(result.quote.totalCents, 3000);
});

test("le prix famille Dynastie du Manager s'applique quand le panier y a droit", async () => {
  const items = [{ productId: "animoco", quantity: 1, options: { chipNumber: CHIP } }, { productId: "shampoing-test", quantity: 1 }];
  const family = await quote(items, { family: true });
  assert.deepEqual(family.quote.lines.map((line) => line.unitPriceCents), [1799, 1200]);
  const publicPrice = await quote(items, { family: false });
  assert.deepEqual(publicPrice.quote.lines.map((line) => line.unitPriceCents), [1999, 1500]);
});

test("panier mixte : historiques et catalogue ensemble, retrait sur place uniquement", async () => {
  const result = await quote([{ productId: "animoco", quantity: 1 }, { productId: "cosmetics:samba", quantity: 2 }, { productId: "shampoing-test", quantity: 1 }]);
  assert.deepEqual(result.quote.lines.map((line) => line.unitPriceCents), [1999, 1145, 1500]);
  assert.equal(result.quote.subtotalCents, 1999 + 2290 + 1500);
  assert.deepEqual(result.quote.availableShippingModes, ["pickup"]);
  const delivery = await quote([{ productId: "animoco", quantity: 1 }, { productId: "shampoing-test", quantity: 1 }], { shipping: { mode: "animoco-light-fr" } });
  assert.equal(delivery.error, "invalid_shipping_mode");
});

test("refuse au-delà de la quantité disponible, un produit fermé à l'achat ou inconnu", async () => {
  assert.equal((await quote([{ productId: "shampoing-test", quantity: 4 }])).error, "out_of_stock");
  assert.equal((await quote([{ productId: "shampoing-test", quantity: 2 }, { productId: "shampoing-test", quantity: 2 }])).error, "out_of_stock");
  assert.equal((await quote([{ productId: "brosse-test", quantity: 1 }])).error, "out_of_stock");
  assert.equal((await quote([{ productId: "gamelle-test", quantity: 1 }])).error, "product_not_purchasable");
  assert.equal((await quote([{ productId: "inconnu-test", quantity: 1 }])).error, "unknown_product");
});

test("catalogue Manager indisponible : refus explicite, sans bloquer les paniers historiques", async () => {
  const down = catalogueSource([], false);
  assert.deepEqual(await quote([{ productId: "shampoing-test", quantity: 1 }], { source: down }), { error: "catalogue_unavailable", status: 503 });
  assert.ok((await quote([{ productId: "animoco", quantity: 1 }], { source: down })).quote);
  assert.deepEqual(await cartCatalog([{ productId: "animoco" }], { listCatalogue: down.listCatalogue }), {});
});

test("le panier ne stocke que la référence et la quantité d'un produit du catalogue", () => {
  assert.deepEqual(catalogueLine("shampoing-test", 2), { productId: "shampoing-test", quantity: 2 });
  for (const value of ["animoco", "cosmetics:samba", "red-dingo:01-EL", "Majuscules", "a b", ""]) assert.throws(() => catalogueLine(value, 1));
  assert.throws(() => catalogueLine("shampoing-test", 21));
  assert.equal(catalogueCartProduct({ ...SHAMPOING, purchasable: "true" }).purchasable, false);
});

const CUSTOMER = { firstName: "Test", lastName: "Panier", email: "panier@example.test", phone: "0600000000", country: "FR" };

function checkoutDeps(managerError) {
  const calls = [];
  return {
    calls,
    listCatalogue: catalogueSource().listCatalogue,
    now: () => new Date("2026-10-17T10:00:00.000Z"),
    origin: "https://boutique.test",
    env: { ORKHAN_SHOP_ORDERS_SECRET: "secret-boutique-test" },
    manager: {
      async createOrder(payload) { calls.push(["create", payload]); if (managerError) throw Object.assign(new Error(managerError), { status: 409, response: { error: managerError } }); return { reference: "BOUT-TEST" }; },
      async attachPaymentReference(reference, payload) { calls.push(["attach", reference, payload]); return {}; }
    },
    payment: { provider: "STRIPE", async createCheckout(payload) { calls.push(["stripe", payload]); return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test/s" }; } }
  };
}

function checkoutInput(items) {
  return { checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items, shipping: { mode: "pickup", pickupTiming: "appointment" }, customer: CUSTOMER, legalAcceptance: { version: "cgv-2026-10-21-3", accepted: true } };
}

test("commande avec un produit du catalogue : prix Manager et session Stripe de 31 minutes", async () => {
  const deps = checkoutDeps();
  const result = await executeCheckout(checkoutInput([{ productId: "shampoing-test", quantity: 1 }, { productId: "cosmetics:samba", quantity: 1 }]), deps);
  assert.equal(result.ok, true);
  assert.deepEqual(deps.calls[0][1].lines.map((line) => [line.productId, line.unitPriceCents]), [["shampoing-test", 1500], ["cosmetics:samba", 1145]]);
  assert.equal(deps.calls[0][1].shipping.mode, "pickup");
  assert.equal(deps.calls[1][1].expiresAt, Date.parse("2026-10-17T10:00:00.000Z") / 1000 + CATALOGUE_CHECKOUT_EXPIRY_SECONDS);
  assert.equal(CATALOGUE_CHECKOUT_EXPIRY_SECONDS, 31 * 60);
});

test("commande uniquement historique : la session Stripe garde sa durée actuelle", async () => {
  const deps = checkoutDeps();
  await executeCheckout(checkoutInput([{ productId: "cosmetics:samba", quantity: 1 }]), deps);
  assert.equal("expiresAt" in deps.calls[1][1], false);
});

test("refus du Manager à la commande : message métier, et aucune session Stripe", async () => {
  for (const [code, expected] of [["OUT_OF_STOCK", "out_of_stock"], ["PRODUCT_NOT_PURCHASABLE", "product_not_purchasable"], ["PRICE_MISMATCH", "price_changed"], ["UNKNOWN_PRODUCT", "unknown_product"]]) {
    const deps = checkoutDeps(code);
    const result = await executeCheckout(checkoutInput([{ productId: "shampoing-test", quantity: 1 }]), deps);
    assert.equal(result.error, expected);
    assert.deepEqual(deps.calls.map((call) => call[0]), ["create"]);
  }
  const deps = checkoutDeps("SHOP_ORDER_UNAVAILABLE");
  await assert.rejects(executeCheckout(checkoutInput([{ productId: "shampoing-test", quantity: 1 }]), deps));
});

test("Stripe : expiration transmise, et clé live refusée hors Production", () => {
  const params = checkoutParameters({ orderReference: "BOUT-TEST", customerEmail: "d@example.test", successUrl: "https://s", cancelUrl: "https://c", currency: "EUR", lines: [], shippingCents: 0, expiresAt: 1792231860 });
  assert.equal(params.get("expires_at"), "1792231860");
  assert.equal(checkoutParameters({ orderReference: "B", customerEmail: "d@example.test", successUrl: "s", cancelUrl: "c", currency: "EUR", lines: [], shippingCents: 0 }).has("expires_at"), false);
  for (const environment of ["preview", "development"]) {
    assert.throws(() => createStripeAdapter({ secretKey: "sk_live_fake", environment }), /stripe_live_key_outside_production/);
    assert.throws(() => createStripeAdapter({ secretKey: "rk_live_fake", environment }), /stripe_live_key_outside_production/);
    assert.equal(createStripeAdapter({ secretKey: "sk_test_fake", environment }).provider, "STRIPE");
  }
  assert.equal(createStripeAdapter({ secretKey: "sk_live_fake", environment: "production" }).provider, "STRIPE");
});

// Croquettes : vendables dès que le Manager les indique achetables, comme les autres produits du catalogue
// (retrait à l'élevage uniquement, prix du Manager) ; les modes des autres familles ne changent pas.
test("croquettes achetables : retrait seul au prix du Manager, livraison refusée, panier mixte en retrait", async () => {
  const { publicProduct } = require("../api/_orkhan-catalog");
  const croquettes = publicProduct({ reference: "croquettes-test", name: "Croquettes chiot 1,5 kg", family: "CROQUETTES", publicPriceCents: 1490,
    familyPriceCents: 1290, weightGrams: 1500, purchasable: true, maxOrderQuantity: 12, photos: [] });
  assert.equal(croquettes.purchasable, true);
  const source = catalogueSource([croquettes]);
  const seul = await quote([{ productId: "croquettes-test", quantity: 2 }], { source, shipping: { mode: "pickup", pickupTiming: "appointment" } });
  assert.equal(seul.quote.subtotalCents, 2980);
  assert.deepEqual(seul.quote.availableShippingModes, ["pickup"]);
  assert.equal(seul.quote.shipping.priceCents, 0);
  const livraison = await quote([{ productId: "croquettes-test", quantity: 1 }], { source, shipping: { mode: "mondial-relay-home" } });
  assert.equal(livraison.error, "invalid_shipping_mode");
  const mixte = await quote([{ productId: "croquettes-test", quantity: 1 }, { productId: "animoco", quantity: 1 }], { source });
  assert.deepEqual(mixte.quote.availableShippingModes, ["pickup"]);
  const animocoSeul = await quote([{ productId: "animoco", quantity: 1 }], { source });
  assert.deepEqual(animocoSeul.quote.availableShippingModes, ["pickup", "animoco-light-fr"]);
});
