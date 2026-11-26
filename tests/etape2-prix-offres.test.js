// Étape 2 : prix public unique, avantage Famille global et offres « X achetés + Y offerts » (SOOPA en données de test
// isolées : aucune donnée de Production). Le calcul est celui du Manager, simulé par tests/helpers/manager-pricing.js
// (réplique de shop-pricing.ts, 068f8be).
const test = require("node:test");
const assert = require("node:assert/strict");
const { publicCommercial, publicProduct } = require("../api/_orkhan-catalog");
const { quoteCartRequest } = require("../api/cart-quote");
const { executeCheckout } = require("../api/_checkout");
const { applyCommercialPricing, publicPricing } = require("../api/_cart-pricing");
const { checkoutParameters } = require("../api/_payment/stripe");
const vitrine = require("../api/_vitrine");
const offersView = require("../api/_offers");
const cart = require("../assets/cart");
const { fakePricingManager } = require("./helpers/manager-pricing");

const NOW = Date.parse("2026-12-10T10:00:00.000Z");
// Fin saisie « 31/01/2027 inclus » dans le Manager : lendemain 00:00 à Paris.
const ENDS_AT = "2027-01-31T23:00:00.000Z";
const FLAVOURS = ["banane", "canneberge", "mangue", "pomme", "chiots", "senior", "mini"];
const raw = (reference, name, priceCents, grams, extra = {}) => ({
  reference, name, family: "COLIS", publicPriceCents: priceCents, familyPriceCents: null, weightGrams: grams, purchasable: true, maxOrderQuantity: 10,
  photos: [], shelf: "ALIMENTATION", subcategory: "friandises", brand: "Soopa", isNew: false, availability: "in_stock", listed: true, ...extra
});
const BOUCHEES = FLAVOURS.map((flavour, index) => raw(`sp-b${index}`, `Soopa – Bouchées ${flavour} – 50 g`, 395, 50));
const BATONNETS = FLAVOURS.map((flavour, index) => raw(`sp-t${index}`, `Soopa – Bâtonnets dentaires ${flavour} – 100 g`, 550, 100));
const SECHOIR = raw("sechoir-test", "Séchoir", 12900, 2000, { shelf: "HYGIENE_SOINS", subcategory: "soins", brand: null, onRequest: true, availability: "on_request" });
const MANAGER_OFFERS = [
  { id: "offre-bouchees", name: "SOOPA – Bouchées 50 g", buyQuantity: 2, freeQuantity: 1, lotQuantity: 3, lotPriceCents: 790, endsAt: ENDS_AT, productReferences: BOUCHEES.map((product) => product.reference) },
  { id: "offre-batonnets", name: "SOOPA – Bâtonnets 100 g", buyQuantity: 2, freeQuantity: 1, lotQuantity: 3, lotPriceCents: 1100, endsAt: ENDS_AT, productReferences: BATONNETS.map((product) => product.reference) }
];
// Forme utilisée par le moteur du Manager (productIds = références).
const ENGINE_OFFERS = MANAGER_OFFERS.map((offer) => ({ id: offer.id, name: offer.name, buyQuantity: offer.buyQuantity, freeQuantity: offer.freeQuantity, productIds: offer.productReferences }));
const PRODUCTS = [...BOUCHEES, ...BATONNETS, SECHOIR].map(publicProduct);
const catalogue = (commercial = { familyDiscountBasisPoints: 500, offers: MANAGER_OFFERS }) => ({
  available: true, products: PRODUCTS, brandCards: [{ slug: "soopa", name: "SOOPA", brand: "Soopa", croquettes: false, friandises: true, displayOrder: 0, photo: null }],
  commercial: publicCommercial(commercial, NOW)
});
const PICKUP = { mode: "pickup", pickupTiming: "appointment" };

function quote(items, { family = false, offers = ENGINE_OFFERS, basisPoints = 500, calls } = {}) {
  return quoteCartRequest({ items, shipping: PICKUP, ...(family ? { familyChipNumber: "250269812345678" } : {}) }, {
    listCatalogue: async () => catalogue(),
    verifyFamilyChip: async () => ({ status: "ok", recognized: true }),
    manager: fakePricingManager({ offers, basisPoints, calls })
  });
}
const line = (productId, quantity = 1) => ({ productId, quantity });
const summary = (result) => ({
  subtotal: result.quote.subtotalCents, offers: result.quote.pricing.offers.map((offer) => [offer.offerId, offer.freeItems, offer.discountCents, offer.missingForNextFree]),
  family: result.quote.pricing.family, total: result.quote.totalCents
});

test("panier public sans promotion : prix publics, aucune remise", async () => {
  const result = await quote([line("sp-b0", 2)], { offers: [] });
  assert.deepEqual(summary(result), { subtotal: 790, offers: [], family: null, total: 790 });
  assert.equal(result.quote.discountCents, 0);
});

test("panier Famille sans promotion : une seule remise globale au taux du Manager, prix des lignes inchangés", async () => {
  const result = await quote([line("sp-b0", 2), line("sp-t0", 1)], { family: true, offers: [] });
  assert.deepEqual(result.quote.lines.map((entry) => entry.unitPriceCents), [395, 550]);
  // 5 % de 13,40 € = 0,67 €.
  assert.deepEqual(summary(result), { subtotal: 1340, offers: [], family: { basisPoints: 500, discountCents: 67 }, total: 1273 });
  // Taux dynamique : 8 % enregistré dans le Manager → 8 %.
  const eight = await quote([line("sp-b0", 2), line("sp-t0", 1)], { family: true, offers: [], basisPoints: 800 });
  assert.deepEqual(eight.quote.pricing.family, { basisPoints: 800, discountCents: 107 });
});

test("SOOPA Bouchées 50 g : 2, 3 et 6 produits", async () => {
  const two = await quote([line("sp-b0", 2)]);
  assert.deepEqual(summary(two), { subtotal: 790, offers: [["offre-bouchees", 0, 0, 1]], family: null, total: 790 });
  const three = await quote([line("sp-b0", 3)]);
  assert.deepEqual(summary(three), { subtotal: 1185, offers: [["offre-bouchees", 1, 395, 0]], family: null, total: 790 }, "7,90 € les trois");
  const six = await quote([line("sp-b0", 6)]);
  assert.deepEqual(summary(six), { subtotal: 2370, offers: [["offre-bouchees", 2, 790, 0]], family: null, total: 1580 });
});

test("SOOPA Bâtonnets 100 g : 2, 3 et 6 produits", async () => {
  assert.deepEqual(summary(await quote([line("sp-t0", 2)])), { subtotal: 1100, offers: [["offre-batonnets", 0, 0, 1]], family: null, total: 1100 });
  assert.deepEqual(summary(await quote([line("sp-t0", 3)])), { subtotal: 1650, offers: [["offre-batonnets", 1, 550, 0]], family: null, total: 1100 }, "11,00 € les trois");
  assert.deepEqual(summary(await quote([line("sp-t0", 6)])), { subtotal: 3300, offers: [["offre-batonnets", 2, 1100, 0]], family: null, total: 2200 });
});

test("panachage des saveurs d'un même format", async () => {
  const mixed = await quote([line("sp-b0"), line("sp-b3"), line("sp-b6")]);
  assert.deepEqual(summary(mixed), { subtotal: 1185, offers: [["offre-bouchees", 1, 395, 0]], family: null, total: 790 });
  const five = await quote([line("sp-t1", 2), line("sp-t2", 2), line("sp-t4")]);
  assert.deepEqual(summary(five).offers, [["offre-batonnets", 1, 550, 1]], "5 bâtonnets : 1 offert, encore 1 pour le suivant");
});

test("aucun mélange entre Bouchées 50 g et Bâtonnets 100 g : deux groupes indépendants", async () => {
  const result = await quote([line("sp-b0", 2), line("sp-t0", 1)]);
  assert.deepEqual(summary(result).offers, [["offre-bouchees", 0, 0, 1], ["offre-batonnets", 0, 0, 2]]);
  assert.equal(result.quote.discountCents, 0);
  const both = await quote([line("sp-b0", 3), line("sp-t0", 3)]);
  assert.deepEqual(summary(both).offers, [["offre-bouchees", 1, 395, 0], ["offre-batonnets", 1, 550, 0]], "une ligne de remise par offre");
});

test("panier mixte avec promotion et avantage Famille : Famille sur le sous-total après offres, médaille Animoco comprise, livraison exclue", async () => {
  const result = await quote([line("sp-b0", 3), line("animoco"), line("sp-t0", 2)], { family: true });
  // 11,85 + 19,99 + 11,00 = 42,84 € ; offre −3,95 € → 38,89 € ; Famille 5 % = 1,94 € → 36,95 €.
  assert.deepEqual(summary(result), { subtotal: 4284, offers: [["offre-bouchees", 1, 395, 0], ["offre-batonnets", 0, 0, 1]], family: { basisPoints: 500, discountCents: 194 }, total: 3695 });
  assert.equal(result.quote.pricing.subtotalAfterOffersCents, 3889);
  assert.equal(result.quote.discountCents, 589);
  assert.equal("lines" in result.quote.pricing, false, "la ventilation par ligne reste invisible pour le client");
  assert.equal(result.quote.lines.every((entry) => !("netCents" in entry) && !("familyDiscountCents" in entry)), true);
});

test("médailles et produits sur commande : remise Famille comprise, ligne Sur commande conservée", async () => {
  const result = await quote([line("sechoir-test"), line("sp-b0", 3)], { family: true });
  assert.equal(result.quote.lines.find((entry) => entry.productId === "sechoir-test").onRequest, true);
  // 129,00 + 11,85 = 140,85 € ; −3,95 € → 136,90 € ; 5 % = 6,85 € (6,845 arrondi une seule fois).
  assert.deepEqual(summary(result), { subtotal: 14085, offers: [["offre-bouchees", 1, 395, 0]], family: { basisPoints: 500, discountCents: 685 }, total: 13005 });
  const redDingo = await quoteCartRequest({ items: [{ productId: "red-dingo:01-BN", quantity: 1, options: { size: "M", colour: "Black", frontLines: ["ORKHAN"] } }], familyChipNumber: "250269812345678" }, {
    verifyFamilyChip: async () => ({ status: "ok", recognized: true }), manager: fakePricingManager()
  });
  assert.equal(redDingo.quote.pricing.family.discountCents, 85, "médaille Red Dingo comprise (16,95 € → −0,85 €)");
});

test("activation, désactivation et expiration : la Boutique suit l'état publié par le Manager", async () => {
  // Désactivée dans le Manager : plus publiée, plus calculée.
  const off = await quote([line("sp-b0", 3)], { offers: [] });
  assert.equal(off.quote.discountCents, 0);
  assert.deepEqual(off.quote.pricing.offers, []);
  // Expirée : écartée de l'affichage même si une page en cache la contient encore.
  const expired = publicCommercial({ familyDiscountBasisPoints: 500, offers: MANAGER_OFFERS.map((offer) => ({ ...offer, endsAt: "2026-12-01T23:00:00.000Z" })) }, NOW);
  assert.deepEqual(expired.offers, []);
  assert.deepEqual(offersView.runningOffers({ commercial: { offers: MANAGER_OFFERS } }, Date.parse("2027-02-01T00:00:00.000Z")), [], "après le 31 janvier 2027 inclus");
  assert.equal(offersView.runningOffers({ commercial: { offers: MANAGER_OFFERS } }, Date.parse("2027-01-31T22:59:00.000Z")).length, 2, "encore valable le 31 janvier au soir");
  // Champs invalides ignorés (liste blanche), offre sans référence écartée.
  const parsed = publicCommercial({ familyDiscountBasisPoints: 99999, offers: [{ id: "x", name: "X", buyQuantity: 2, freeQuantity: 1, productReferences: [] }, { ...MANAGER_OFFERS[0], secret: "s" }] }, NOW);
  assert.equal(parsed.familyDiscountBasisPoints, null);
  assert.deepEqual(Object.keys(parsed.offers[0]).sort(), ["buyQuantity", "endsAt", "freeQuantity", "id", "lotPriceCents", "lotQuantity", "name", "productReferences"]);
  assert.equal(publicCommercial(undefined), null);
});

test("rupture d'une référence : la promotion reste sur les autres références", () => {
  const products = PRODUCTS.map((product) => product.reference === "sp-b1" ? { ...product, availability: "out_of_stock", maxOrderQuantity: 0 } : product);
  const fiches = vitrine.buildFiches(products, offersView.runningOffers(catalogue(), NOW));
  assert.equal(fiches.find((fiche) => fiche.slug === "sp-b1").offer, null, "pas de pastille sur la référence en rupture");
  assert.equal(fiches.find((fiche) => fiche.slug === "sp-b2").offer.id, "offre-bouchees");
  const page = vitrine.renderAlimentation({ ...catalogue(), products }, "friandises", "soopa");
  assert.match(page, /class="offer-banner"/);
});

test("Stripe : une ligne « Articles » au montant net, la livraison à part, sans coupon ; montant identique à la commande", async () => {
  const created = [];
  const stripe = [];
  const result = await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items: [line("sp-b0", 3), line("sp-t2", 3), line("animoco")], shipping: PICKUP,
    familyChipNumber: "250269812345678",
    customer: { firstName: "Test", lastName: "Offres", email: "offres@example.test", phone: "0600000000", country: "FR" },
    legalAcceptance: { version: "cgv-2026-11-26", accepted: true }
  }, {
    env: { ORKHAN_SHOP_ORDERS_SECRET: "secret-test" }, origin: "https://boutique.test", now: () => new Date(NOW),
    listCatalogue: async () => catalogue(), verifyFamilyChip: async () => ({ status: "ok", recognized: true }),
    manager: { ...fakePricingManager({ offers: ENGINE_OFFERS }), async createOrder(payload) { created.push(payload); return { reference: "BOUT-TEST" }; }, async attachPaymentReference() { return {}; } },
    payment: { provider: "STRIPE", async createCheckout(input) { stripe.push(input); return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test" }; } }
  });
  assert.equal(result.ok, true);
  const order = created[0];
  // 11,85 + 16,50 + 19,99 = 48,34 € ; offres −3,95 −5,50 → 38,89 € ; Famille −1,94 € → 36,95 €.
  assert.deepEqual([order.pricingVersion, order.subtotalCents, order.discountCents, order.shippingCents, order.totalCents], [2, 4834, 1139, 0, 3695]);
  assert.deepEqual(order.lines.map((entry) => [entry.productId, entry.unitPriceCents, entry.quantity]), [["sp-b0", 395, 3], ["sp-t2", 550, 3], ["animoco", 1999, 1]], "lignes au prix public");
  assert.equal(order.dynastieFamilyEligible, true);
  const params = checkoutParameters({ ...stripe[0], orderReference: "BOUT-TEST", customerEmail: "offres@example.test", successUrl: "https://s", cancelUrl: "https://c" });
  assert.equal(params.get("line_items[0][price_data][product_data][name]"), "Articles");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "3695");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.has("line_items[1][price_data][unit_amount]"), false, "retrait : pas de ligne Livraison");
  assert.equal([...params.keys()].some((key) => /discount|coupon/.test(key)), false);
  const stripeTotal = [...params.keys()].filter((key) => key.endsWith("[unit_amount]")).reduce((sum, key) => sum + Number(params.get(key)) * Number(params.get(key.replace("[price_data][unit_amount]", "[quantity]"))), 0);
  assert.equal(stripeTotal, order.totalCents);
});

test("Stripe avec livraison : Articles (net) + Livraison (non remisée) = total de la commande", async () => {
  const created = [];
  const stripe = [];
  await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174001", items: [{ productId: "animoco", quantity: 2 }], shipping: { mode: "animoco-light-fr" },
    familyChipNumber: "250269812345678",
    customer: { firstName: "T", lastName: "L", email: "l@example.test", phone: "0600000000", address: "1 rue", addressExtra: "", postalCode: "59000", city: "Lille", country: "FR" },
    legalAcceptance: { version: "cgv-2026-11-26", accepted: true }
  }, {
    origin: "https://boutique.test", verifyFamilyChip: async () => ({ status: "ok", recognized: true }),
    manager: { ...fakePricingManager(), async createOrder(payload) { created.push(payload); return { reference: "BOUT-TEST" }; }, async attachPaymentReference() { return {}; } },
    payment: { provider: "STRIPE", async createCheckout(input) { stripe.push(input); return { providerRef: "cs_test_2", checkoutUrl: "https://checkout.stripe.test" }; } }
  });
  // 39,98 € − 2,00 € (5 %) + 3,50 € = 41,48 €.
  assert.deepEqual([created[0].subtotalCents, created[0].discountCents, created[0].shippingCents, created[0].totalCents], [3998, 200, 350, 4148]);
  const params = checkoutParameters({ ...stripe[0], orderReference: "BOUT-TEST", customerEmail: "l@example.test", successUrl: "https://s", cancelUrl: "https://c" });
  assert.deepEqual([params.get("line_items[0][price_data][product_data][name]"), params.get("line_items[0][price_data][unit_amount]"), params.get("line_items[1][price_data][product_data][name]"), params.get("line_items[1][price_data][unit_amount]")], ["Articles", "3798", "Livraison", "350"]);
});

test("garde-fous : réponse incohérente ou Manager indisponible bloquent le devis ; prix public divergent = price_changed", async () => {
  const baseQuote = { lines: [{ productId: "sp-b0", family: "catalogue", quantity: 3, unitPriceCents: 395 }], subtotalCents: 1185, shipping: { priceCents: 0 } };
  const broken = { quotePricing: async () => ({ pricing: { version: 2, itemsSubtotalCents: 1185, offers: [], offersDiscountCents: 395, subtotalAfterOffersCents: 790, family: null, discountCents: 395, netSubtotalCents: 790 } }) };
  assert.deepEqual(await applyCommercialPricing(baseQuote, false, { manager: broken }), { error: "pricing_unavailable", status: 503 });
  const down = fakePricingManager({ fail: Object.assign(new Error("down"), { status: 503 }) });
  assert.deepEqual(await applyCommercialPricing(baseQuote, false, { manager: down }), { error: "pricing_unavailable", status: 503 });
  const refused = fakePricingManager({ fail: Object.assign(new Error("x"), { status: 409, response: { error: "PRODUCT_NOT_PURCHASABLE" } }) });
  assert.deepEqual(await applyCommercialPricing(baseQuote, false, { manager: refused }), { error: "product_not_purchasable", status: 409 });
  const otherPrice = fakePricingManager({ prices: { "sp-b0": 450 } });
  assert.deepEqual(await applyCommercialPricing(baseQuote, false, { manager: otherPrice }), { error: "price_changed", status: 409 });
  assert.equal(publicPricing({ pricing: { version: 1 } }, 0), null);
  // Panier historique sans Famille : aucun appel au Manager.
  const calls = [];
  const legacy = await applyCommercialPricing({ lines: [{ productId: "animoco", family: "animoco", quantity: 1, unitPriceCents: 1999 }], subtotalCents: 1999, shipping: null }, false, { manager: fakePricingManager({ calls }) });
  assert.equal(calls.length, 0);
  assert.equal(legacy.quote.totalCents, null);
  assert.equal(legacy.quote.discountCents, 0);
});

test("panier (navigateur) : une ligne par offre, une seule ligne Avantage Famille, offerts et manquants", async () => {
  const result = await quote([line("sp-b0", 3), line("sp-t0", 2)], { family: true });
  assert.deepEqual(cart.discountRows(result.quote).map((row) => [row.label, row.amountCents]), [
    ["SOOPA – Bouchées 50 g (2 + 1 offert)", 395],
    ["Avantage Famille : −5 %", 95]
  ]);
  assert.deepEqual(cart.offerProgressMessages(result.quote).map((message) => message.text), [
    "1 produit offert.",
    "Ajoutez encore 1 produit de l’offre pour en obtenir 1 offert."
  ]);
  const four = await quote([line("sp-b0", 4)]);
  assert.equal(cart.offerProgressMessages(four.quote)[0].text, "1 produit offert ; ajoutez encore 2 produits de l’offre pour en obtenir un de plus.");
  assert.deepEqual(cart.discountRows(null), []);
});

test("affichages : pastille et panachage sur les cartes, prix public unique conservé", () => {
  const fiches = vitrine.buildFiches(PRODUCTS, offersView.runningOffers(catalogue(), NOW));
  const card = vitrine.ficheCard(fiches.find((fiche) => fiche.slug === "sp-b0"));
  assert.match(card, /<span class="tile-offer">2 \+ 1 offert<\/span>/);
  assert.match(card, /Panachage possible/);
  assert.match(card, /<p class="product-price">3,95 €<\/p>/);
  assert.doesNotMatch(card, /Famille/);
  assert.doesNotMatch(vitrine.ficheCard(fiches.find((fiche) => fiche.slug === "sechoir-test")), /tile-offer/);
});

test("affichages : encart de la fiche produit (offre, lot, économie, panachage, date, stocks, panier)", () => {
  const html = vitrine.renderFiche(catalogue(), "sp-b2");
  const encart = html.match(/<aside class="fiche-offer"[\s\S]*?<\/aside>/)[0];
  assert.match(encart, /SOOPA – Bouchées 50 g/);
  assert.match(encart, /2 produits achetés, 1 offert : <strong>7,90 € les 3<\/strong> au lieu de 11,85 €, soit 3,95 € d’économie/);
  assert.match(encart, /Panachage possible entre les 7 références de l’offre/);
  assert.match(encart, /Offre valable jusqu’au 31 janvier 2027 inclus, dans la limite des stocks disponibles\./);
  assert.match(encart, /La remise s’applique automatiquement dans le panier\./);
  assert.match(html, /data-fiche-price>3,95 €/);
  assert.match(html, /<strong>Avantage Famille<\/strong> : 5 % de remise sur tout le panier/);
  assert.doesNotMatch(html, /Prix Famille|Tarif Famille/);
  // Prix de lot non affiché quand les références de l'offre n'ont pas toutes le même prix.
  assert.doesNotMatch(offersView.ficheOfferHtml({ ...MANAGER_OFFERS[0], lotPriceCents: null }, false), /les 3|économie/);
  // Sans date de fin : seulement la mention des stocks.
  assert.match(offersView.ficheOfferHtml({ ...MANAGER_OFFERS[0], endsAt: null }, false), /<li>Dans la limite des stocks disponibles\.<\/li>/);
  // Fiche hors offre : aucun encart.
  assert.doesNotMatch(vitrine.renderFiche(catalogue(), "sechoir-test"), /fiche-offer/);
});

test("affichages : un seul bandeau regroupant les deux offres SOOPA, sur l'accueil, le rayon Alimentation et la page SOOPA", () => {
  const pages = {
    accueil: vitrine.renderAccueil(catalogue()),
    alimentation: vitrine.renderRayon(catalogue(), "alimentation"),
    soopa: vitrine.renderAlimentation(catalogue(), "friandises", "soopa")
  };
  for (const [name, html] of Object.entries(pages)) {
    assert.equal((html.match(/class="offer-banner"/g) || []).length, 1, name);
    const banner = html.match(/<section class="offer-banner"[\s\S]*?<\/section>/)[0];
    assert.match(banner, /Soopa · Offres en cours/, name);
    assert.match(banner, /2 achetés \+ 1 offert/, name);
    assert.match(banner, /SOOPA – Bouchées 50 g<\/span><span class="offer-banner-price"><strong>7,90 € les 3<\/strong> au lieu de 11,85 €/, name);
    assert.match(banner, /SOOPA – Bâtonnets 100 g<\/span><span class="offer-banner-price"><strong>11,00 € les 3<\/strong> au lieu de 16,50 €/, name);
    assert.match(banner, /Panachez librement les saveurs d’un même format \(50 g ou 100 g\)\. Offre valable jusqu’au 31 janvier 2027 inclus/, name);
    assert.doesNotMatch(banner, /Panachage possible entre les références/, name);
    assert.equal(/offer-banner-link/.test(banner), name !== "soopa", `${name} : lien vers la page SOOPA, sauf sur la page SOOPA`);
  }
  // Affichage générique pour les futures offres : formats lus dans les noms, sinon formulation générale.
  const named = (names) => offersView.offerBannerHtml(names.map((name, index) => ({ ...MANAGER_OFFERS[index % 2], id: `o${index}`, name })));
  assert.match(named(["Croquettes A 2 kg", "Croquettes A 12 kg", "Croquettes A 1,5 kg"]), /Panachez librement les saveurs d’un même format \(2 kg, 12 kg ou 1,5 kg\)\./);
  assert.match(named(["Offre jouets", "Offre peluches"]), /Panachage possible entre les références d’une même offre\./);
  assert.match(named(["SOOPA 50 g", "Autre 50 g"]), /Panachage possible entre les références d’une même offre\./, "même format des deux côtés : formulation générale");
  assert.match(named(["SOOPA – Bouchées 50 g"]), /Panachage possible entre les références de l’offre\./);
  assert.match(pages.accueil, /href="\/rayons\/alimentation\/friandises\/soopa\/">Voir les produits/);
  // Offres désactivées ou terminées : plus aucun bandeau.
  const none = { ...catalogue(), commercial: { familyDiscountBasisPoints: 500, offers: [] } };
  for (const html of [vitrine.renderAccueil(none), vitrine.renderRayon(none, "alimentation"), vitrine.renderAlimentation(none, "friandises", "soopa")]) assert.doesNotMatch(html, /offer-banner|tile-offer/);
  // Les autres rayons n'ont pas de bandeau.
  assert.doesNotMatch(vitrine.renderRayon(catalogue(), "hygiene-et-soins"), /offer-banner/);
});

test("bandeau Avantage Famille de l'accueil : textes demandés, taux dynamique", () => {
  const html = vitrine.renderAccueil(catalogue());
  const famille = html.match(/<section class="famille"[\s\S]*?<\/section>/)[0];
  assert.match(famille, /<h2 id="famille-title">5 % de remise toute l’année pour nos familles adoptantes<\/h2>/);
  assert.match(famille, /<p>Bénéficiez de 5 % de remise sur vos achats, cumulable avec les offres promotionnelles en cours\.<\/p>/);
  assert.match(famille, /Activez votre avantage dans le panier avec le numéro de puce de votre chien ou votre Code Famille, avant le paiement\./);
  assert.match(famille, /class="home-promise-badge"/, "pictogramme conservé");
  assert.match(vitrine.renderAccueil({ ...catalogue(), commercial: { familyDiscountBasisPoints: 450, offers: [] } }), /4,5 % de remise toute l’année/);
});
