process.env.ORKHAN_LEGACY_COSMETICS_FOR_SALE = "true"; // fixture historique : ces tests utilisent cosmetics:* comme colis générique (le refus Artero est testé dans retrait-artero.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chipNumbers, resolveFamilyEligibility } = require("../api/_family-benefit");
const { quoteCartRequest } = require("../api/cart-quote");
const { executeCheckout } = require("../api/_checkout");
const { STORAGE_KEY, FAMILY_CHIP_STORAGE_KEY, buildCheckoutPayload, buildQuotePayload, createCartStore, createFamilyChipStore } = require("../assets/cart");

// Vérification Familles Dynastie unique, au niveau du panier commun, réutilisant la vérification I-CAD du Manager.
const CHIP = "250269812345678";
const CROQUETTES = { reference: "croquettes-test", name: "Croquettes", family: "CROQUETTES", publicPriceCents: 1490, familyPriceCents: 1290, weightGrams: 1500, purchasable: true, maxOrderQuantity: 12 };
const SANS_PRIX_FAMILLE = { reference: "laisse-test", name: "Laisse", family: "COLIS", publicPriceCents: 900, familyPriceCents: null, weightGrams: 120, purchasable: true, maxOrderQuantity: 5 };
const RD = { productId: "red-dingo:01-BN", quantity: 1, options: { size: "M", colour: "Black", frontLines: ["ORKHAN"] } };
const ITEMS = [{ productId: "croquettes-test", quantity: 1 }, { productId: "laisse-test", quantity: 1 }, { productId: "animoco", quantity: 1 }, { productId: "cosmetics:samba", quantity: 1 }];
// Phase 4 : Red Dingo se commande séparément ; son prix (sans tarif Famille) est vérifié sur un panier à part.
const verifier = (recognized, calls = []) => async (chip) => { calls.push(chip); return { status: "ok", recognized }; };
const quote = (input, verifyFamilyChip) => quoteCartRequest(input, {
  listCatalogue: async () => ({ available: true, products: [CROQUETTES, SANS_PRIX_FAMILLE] }), verifyFamilyChip,
  manager: require("./helpers/manager-pricing").fakePricingManager()
});
const prices = (result) => Object.fromEntries(result.quote.lines.map((line) => [line.productId, line.unitPriceCents]));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), values };
}

test("une seule puce par panier : puce commune, ancienne puce Animoco reprise, même numéro compté une fois", () => {
  assert.deepEqual(chipNumbers([], CHIP), [CHIP]);
  assert.deepEqual(chipNumbers([{ productId: "animoco", options: { chipNumber: "250 269 812 345 678" } }], CHIP), [CHIP]);
  assert.deepEqual(chipNumbers([{ productId: "animoco", options: { chipNumber: CHIP } }]), [CHIP]);
  assert.equal(chipNumbers([{ productId: "animoco", options: { chipNumber: "250269800000000" } }], CHIP).length, 2);
  assert.deepEqual(chipNumbers([{ productId: "croquettes-test", options: { chipNumber: CHIP } }]), []);
});

test("étape 2 : puce reconnue, prix publics inchangés et avantage Famille global sur tout le panier, quelle que soit sa composition", async () => {
  const calls = [];
  const result = await quote({ items: ITEMS, familyChipNumber: CHIP }, verifier(true, calls));
  assert.deepEqual(calls, [CHIP]);
  assert.equal(result.quote.benefits.dynastieFamily, true);
  assert.deepEqual(prices(result), { "croquettes-test": 1490, "laisse-test": 900, animoco: 1999, "cosmetics:samba": 1145 });
  // 5 % de 55,34 € = 2,77 €, une seule ligne, articles sans ancien prix Famille compris.
  assert.deepEqual(result.quote.pricing.family, { basisPoints: 500, discountCents: 277 });
  const redDingo = await quote({ items: [RD], familyChipNumber: CHIP }, verifier(true));
  assert.deepEqual(prices(redDingo), { "red-dingo:01-BN": 1695 });
  assert.equal(redDingo.quote.pricing.family.discountCents, 85, "médaille Red Dingo comprise");
  const seules = await quote({ items: [{ productId: "croquettes-test", quantity: 2 }], familyChipNumber: CHIP }, verifier(true));
  assert.equal(seules.quote.subtotalCents, 2980);
  assert.equal(seules.quote.pricing.netSubtotalCents, 2831);
});

test("sans puce, puce non reconnue ou invalide : aucune remise Famille", async () => {
  const publics = { "croquettes-test": 1490, "laisse-test": 900, animoco: 1999, "cosmetics:samba": 1145 };
  const calls = [];
  const sans = await quote({ items: ITEMS }, verifier(true, calls));
  assert.deepEqual([prices(sans), calls.length], [publics, 0]);
  assert.equal(sans.quote.pricing.family, null);
  assert.deepEqual(prices(await quote({ items: ITEMS, familyChipNumber: CHIP }, verifier(false))), publics);
  assert.deepEqual(await quote({ items: ITEMS, familyChipNumber: "123" }, async () => ({ status: "invalid" })), { error: "invalid_chip", status: 400 });
  assert.deepEqual(await quote({ items: ITEMS, familyChipNumber: CHIP }, async () => ({ status: "unavailable" })), { error: "family_verification_unavailable", status: 503 });
  assert.equal((await resolveFamilyEligibility([], { familyChipNumber: CHIP, verifyFamilyChip: verifier(true) })).familyEligible, true);
});

test("paiement : la puce du panier est revérifiée côté serveur ; le Manager ne reçoit que l'éligibilité, jamais la puce", async () => {
  const created = [];
  const calls = [];
  const result = await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items: [{ productId: "croquettes-test", quantity: 1 }], shipping: { mode: "pickup", pickupTiming: "appointment" },
    familyChipNumber: CHIP,
    customer: { firstName: "Test", lastName: "Famille", email: "contact@dynastiedorkhan.com", phone: "0600000000", country: "FR" },
    legalAcceptance: { version: "cgv-2026-10-21-3", accepted: true }
  }, {
    env: { ORKHAN_SHOP_ORDERS_SECRET: "secret-test" }, origin: "https://boutique.test",
    listCatalogue: async () => ({ available: true, products: [CROQUETTES] }), verifyFamilyChip: verifier(true, calls),
    manager: { ...require("./helpers/manager-pricing").fakePricingManager(), async createOrder(payload) { created.push(payload); return { reference: "BOUT-2026-ABCDEF1234" }; }, async attachPaymentReference() { return {}; } },
    payment: { provider: "STRIPE", async createCheckout() { return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test" }; } }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [CHIP]);
  assert.equal(created[0].dynastieFamilyEligible, true);
  assert.equal(created[0].lines[0].unitPriceCents, 1490);
  assert.equal(created[0].discountCents, 75);
  assert.equal(created[0].totalCents, 1415);
  assert.doesNotMatch(JSON.stringify(created[0]), new RegExp(CHIP));
});

test("panier : la puce Famille est conservée une seule fois, hors des lignes, et envoyée seulement si elle existe", () => {
  assert.equal("familyChipNumber" in buildQuotePayload([], null), false);
  assert.equal(buildQuotePayload([], null, ` ${CHIP} `).familyChipNumber, CHIP);
  assert.equal(buildCheckoutPayload([], { mode: "pickup" }, {}, "id", CHIP).familyChipNumber, CHIP);
  const storage = memoryStorage();
  const family = createFamilyChipStore({ storage, now: () => Date.parse("2026-10-18T10:00:00.000Z") });
  assert.equal(family.set(CHIP), CHIP);
  assert.equal(createFamilyChipStore({ storage, now: () => Date.parse("2026-10-20T10:00:00.000Z") }).get(), CHIP);
  assert.equal(createFamilyChipStore({ storage, now: () => Date.parse("2026-12-01T10:00:00.000Z") }).get(), "");
  family.clear();
  assert.equal(storage.getItem(FAMILY_CHIP_STORAGE_KEY), null);
});

test("anciens paniers : la puce rangée sur la ligne Animoco en est retirée et reprise comme puce du panier", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, updatedAt: "2026-10-18T09:00:00.000Z",
    items: [{ lineId: "l1", productId: "animoco", quantity: 2, options: { chipNumber: CHIP, familyEligible: true } }, { lineId: "l2", productId: "cosmetics:samba", quantity: 1 }] }) });
  const store = createCartStore({ storage, now: () => Date.parse("2026-10-18T10:00:00.000Z") });
  assert.deepEqual(store.getItems(), [{ lineId: "l1", productId: "animoco", quantity: 2 }, { lineId: "l2", productId: "cosmetics:samba", quantity: 1 }]);
  assert.doesNotMatch(storage.getItem(STORAGE_KEY), new RegExp(CHIP));
  assert.equal(store.takeLegacyFamilyChip(), CHIP);
  assert.equal(store.takeLegacyFamilyChip(), "");
  store.add({ productId: "animoco", quantity: 1, options: { chipNumber: CHIP } });
  assert.deepEqual(store.getItems()[2].options, undefined);
});

test("pages : zone unique dans le panier ; la page Animoco garde sa vérification et alimente la puce du panier", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const panier = read("panier/index.html");
  assert.match(panier, /Vous êtes une Famille Dynastie \?/);
  for (const attribute of ["data-family-chip ", "data-family-chip-verify", "data-family-chip-remove", "data-family-status"]) assert.ok(panier.includes(attribute), attribute);
  const animoco = read("medailles-connectees/order.js");
  assert.match(animoco, /OrkhanProductCart\.animocoLine\(\{quantity:quantity\.value\}\)/);
  assert.doesNotMatch(animoco, /familyChipStore|\/api\/family-eligibility/, "lot A3 : plus de vérification sur la fiche Animoco");
});
