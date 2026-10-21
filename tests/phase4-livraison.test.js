const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { quoteCart } = require("../api/_cart");
const { executeCheckout, SHOP_LEGAL_CURRENT_VERSION } = require("../api/_checkout");
const { SHIPPING_CONFIG } = require("../api/_shipping");
const cart = require("../assets/cart");

// Phase 4 : livraison et retrait (Red Dingo séparé UE 27, Animoco France, retrait avec moment, nouvelle version des CGV).
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const RD = { productId: "red-dingo:01-BN", quantity: 1, options: { size: "M", colour: "Black", frontLines: ["ORKHAN"] } };
const CUSTOMER = { firstName: "Alice", lastName: "Martin", email: "alice@example.test", phone: "0600000000", address: "1 Hauptstraße", postalCode: "10115", city: "Berlin", country: "DE" };

function deps() {
  const calls = [];
  return {
    calls,
    manager: {
      async createOrder(payload) { calls.push(["create", payload]); return { reference: "BOUT-TEST" }; },
      async attachPaymentReference() { calls.push(["attach"]); return { status: "PENDING_PAYMENT" }; }
    },
    payment: { provider: "STRIPE", async createCheckout() { calls.push(["stripe"]); return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test/s" }; } },
    origin: "https://boutique.test"
  };
}
const checkout = (input, dependencies) => executeCheckout({ checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", legalAcceptance: { version: SHOP_LEGAL_CURRENT_VERSION, accepted: true }, engravingConfirmed: true, ...input }, dependencies);

test("une seule liste UE 27 pour le formulaire et la validation Red Dingo", () => {
  const countries = SHIPPING_CONFIG.redDingo.servedCountries;
  assert.equal(countries.length, 27);
  const select = read("panier/index.html").match(/<select name="country"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([A-Z]{2})">/g)].map((match) => match[1]);
  assert.deepEqual([...options].sort(), [...countries].sort());
  assert.equal(options[0], "FR");
});

test("Red Dingo : livraison fabricant seule, frais compris, dans l'UE 27", async () => {
  assert.deepEqual(quoteCart({ items: [RD] }).quote.availableShippingModes, ["red-dingo-free"]);
  assert.equal(quoteCart({ items: [RD], shipping: { mode: "pickup", pickupTiming: "appointment" } }).error, "invalid_shipping_mode");
  const germany = deps();
  const ok = await checkout({ items: [RD], shipping: { mode: "red-dingo-free" }, customer: CUSTOMER }, germany);
  assert.equal(ok.ok, true);
  assert.equal(germany.calls[0][1].shippingCents, 0);
  const swiss = deps();
  assert.equal((await checkout({ items: [RD], shipping: { mode: "red-dingo-free" }, customer: { ...CUSTOMER, country: "CH" } }, swiss)).error, "invalid_customer");
  assert.deepEqual(swiss.calls, []);
});

test("retrait : moment exigé au paiement, transmis au Manager, sans date", async () => {
  const items = [{ productId: "animoco", quantity: 1 }];
  const customer = { ...CUSTOMER, address: "", postalCode: "", city: "", country: "" };
  const missing = deps();
  assert.deepEqual(await checkout({ items, shipping: { mode: "pickup" }, customer }, missing), { error: "pickup_timing_required", status: 400 });
  assert.deepEqual(missing.calls, []);
  assert.equal(quoteCart({ items, shipping: { mode: "pickup", pickupTiming: "demain" } }).error, "invalid_pickup_timing");
  const ok = deps();
  assert.equal((await checkout({ items, shipping: { mode: "pickup", pickupTiming: "puppy-departure" }, customer }, ok)).ok, true);
  assert.deepEqual(ok.calls[0][1].shipping, { mode: "pickup", priceCents: 0, pickupTiming: "puppy-departure" });
});

test("panier : libellés de la feuille de route et messages", () => {
  assert.equal(cart.PICKUP_TIMING_QUESTION, "Quand souhaitez-vous retirer vos achats ?");
  assert.deepEqual(cart.PICKUP_TIMING_LABELS, { "puppy-departure": "Lors du départ de mon chiot", appointment: "À une autre date, sur rendez-vous" });
  assert.match(cart.quoteStatusMessage({ error: "red_dingo_separate_order" }), /se commandent séparément/);
  assert.equal(cart.quoteStatusMessage({ error: "pickup_timing_required" }), "Indiquez quand vous souhaitez retirer vos achats.");
});

test("CGV : nouvelle version identique dans le JSON, le serveur et le panier ; anciennes versions conservées", () => {
  const legal = require(`../legal/${SHOP_LEGAL_CURRENT_VERSION}.json`);
  assert.equal(legal.version, SHOP_LEGAL_CURRENT_VERSION);
  assert.equal(cart.SHOP_LEGAL_CURRENT_VERSION, SHOP_LEGAL_CURRENT_VERSION);
  for (const version of ["cgv-2026-10-05", "cgv-2026-10-07"]) assert.equal(require(`../legal/${version}.json`).version, version);
  const page = read("conditions-generales-de-vente/index.html");
  assert.match(page, /5\.6\. <strong>Commande séparée des médailles Red Dingo\.<\/strong>/);
  assert.match(page, /Quand souhaitez-vous retirer vos achats \?/);
  assert.doesNotMatch(page, /Mondial Relay|France et la Belgique uniquement/);
});

test("pages produits : Animoco en France, Red Dingo en UE 27 et commandé séparément", () => {
  const animoco = read("medailles-connectees/index.html");
  assert.match(animoco, /Livraison en France uniquement\./);
  assert.doesNotMatch(animoco, /Belgique|Mondial Relay/);
  const redDingo = read("index.html");
  assert.match(redDingo, /27 pays de l’Union européenne/);
  assert.doesNotMatch(redDingo, /Retrait gratuit à l’élevage possible/);
});
