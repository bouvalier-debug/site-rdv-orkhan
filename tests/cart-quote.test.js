const test = require("node:test");
const assert = require("node:assert/strict");
const colours = require("../data/red-dingo-colours.json");
const engraving = require("../data/red-dingo-engraving.json");
const { buildCatalog, redDingoProduct } = require("../api/_catalog");
const { quoteCart } = require("../api/_cart");
const { SHIPPING_CONFIG, SHIPPING_MODES } = require("../api/_shipping");
const cartQuoteHandler = require("../api/cart-quote");

const TEST_SHIPPING_CONFIG = {
  ...SHIPPING_CONFIG,
  mondialRelay: {
    servedCountries: ["FR", "BE"],
    pickupRates: [
      { maxWeightGrams: 500, priceCents: 420 },
      { maxWeightGrams: 1000, priceCents: 590 }
    ],
    homeRates: [
      { maxWeightGrams: 500, priceCents: 790 },
      { maxWeightGrams: 1000, priceCents: 990 }
    ]
  }
};
const TEST_PRODUCTS = [
  { id: "test-colis", name: "Produit colis test", family: "colis", priceCents: 1290, weightGrams: 400 },
  { id: "test-croquettes", name: "Croquettes test", family: "croquettes", priceCents: 5000, weightGrams: 10000 }
];
const TEST_CATALOG = buildCatalog(TEST_PRODUCTS);
TEST_CATALOG.set("animoco", { ...TEST_CATALOG.get("animoco"), weightGrams: 100 });

function quote(items, shipping, extra = {}) {
  return quoteCart({ items, shipping, ...extra }, {
    catalog: TEST_CATALOG,
    shippingConfig: TEST_SHIPPING_CONFIG
  });
}

test("1 Animoco France utilise le prix public et l'envoi léger", () => {
  const result = quote([{ productId: "animoco", quantity: 1 }], { mode: SHIPPING_MODES.ANIMOCO_LIGHT_FR });
  assert.equal(result.quote.totalCents, 2349);
  assert.equal(result.quote.shippingProfile.kind, "animoco-light");
});

test("2 Animoco Belgique utilisent l'envoi léger", () => {
  const result = quote([{ productId: "animoco", quantity: 2 }], { mode: SHIPPING_MODES.ANIMOCO_LIGHT_BE });
  assert.equal(result.quote.totalCents, 4488);
});

test("3 Animoco basculent en colis", () => {
  const result = quote([{ productId: "animoco", quantity: 3 }]);
  assert.equal(result.quote.shippingProfile.kind, "parcel");
  assert.deepEqual(result.quote.availableShippingModes, ["pickup", "mondial-relay-pickup", "mondial-relay-home"]);
});

test("sans poids ni grilles réels, Mondial Relay n'est jamais payable", () => {
  const productionCatalog = buildCatalog();
  const result = quoteCart({ items: [{ productId: "animoco", quantity: 3 }] }, { catalog: productionCatalog });
  assert.equal(result.quote.shippingProfile.kind, "parcel");
  assert.equal(result.quote.shippingStatus, "shipping_unavailable");
  assert.deepEqual(result.quote.availableShippingModes, ["pickup"]);

  const attempted = quoteCart({
    items: [{ productId: "animoco", quantity: 3 }],
    shipping: { mode: "mondial-relay-pickup", relayPoint: { id: "FR-123", address: "1 rue Test" } }
  }, { catalog: productionCatalog });
  assert.equal(attempted.error, "shipping_unavailable");
  assert.deepEqual(attempted.availableModes, ["pickup"]);
});

test("Animoco plus produit colis basculent en colis", () => {
  const result = quote([{ productId: "animoco", quantity: 1 }, { productId: "test-colis", quantity: 1 }]);
  assert.equal(result.quote.shippingProfile.kind, "parcel");
  assert.equal(result.quote.shippingProfile.parcelWeightGrams, 500);
});

test("Animoco plus Red Dingo garde l'envoi léger et le port Red Dingo offert", () => {
  const result = quote([
    { productId: "animoco", quantity: 1 },
    { productId: "red-dingo:01-BN", quantity: 1, options: { size: "M", colour: "Black", frontLines: ["ORKHAN"] } }
  ], { mode: SHIPPING_MODES.ANIMOCO_LIGHT_FR });
  assert.equal(result.quote.shippingProfile.kind, "animoco-light");
  assert.equal(result.quote.shippingProfile.hasRedDingo, true);
  assert.equal(result.quote.totalCents, 4044);
});

test("les prix public et Famille sont recalculés depuis le catalogue", () => {
  const publicQuote = quote([{ productId: "animoco", quantity: 1 }], { mode: "pickup" });
  const familyQuote = quote([{ productId: "animoco", quantity: 1, priceCents: 1 }], { mode: "pickup" }, {
    benefits: { dynastieFamily: true }, priceCents: 1, shippingCents: 1, totalCents: 1
  });
  assert.equal(publicQuote.quote.totalCents, 1999);
  assert.equal(familyQuote.quote.totalCents, 1799);
});

test("un produit colis prend la bonne tranche relais/Locker", () => {
  const result = quote([{ productId: "test-colis", quantity: 1 }], {
    mode: "mondial-relay-pickup", relayPoint: { id: "FR-12345", address: "1 rue du Test", country: "FR" }
  });
  assert.equal(result.quote.shipping.priceCents, 420);
  assert.equal(result.quote.totalCents, 1710);
});

test("un produit colis prend la bonne tranche domicile", () => {
  const result = quote([{ productId: "test-colis", quantity: 2 }], {
    mode: "mondial-relay-home",
    address: { line1: "1 rue du Test", postalCode: "75001", city: "Paris", country: "FR" }
  });
  assert.equal(result.quote.shipping.priceCents, 990);
  assert.equal(result.quote.totalCents, 3570);
});

test("Red Dingo refuse une référence inconnue", () => {
  assert.equal(quoteCart({ items: [{ productId: "red-dingo:INCONNUE", quantity: 1 }] }).error, "unknown_product");
});

test("Red Dingo refuse une taille interdite", () => {
  const result = quote([{ productId: "red-dingo:01-FI", quantity: 1,
    options: { size: "M", colour: "Black", frontLines: ["CHAT"] } }]);
  assert.equal(result.error, "red_dingo_size_not_allowed");
});

test("Red Dingo refuse une couleur invalide", () => {
  const result = quote([{ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Chartreuse", frontLines: ["CHIEN"] } }]);
  assert.equal(result.error, "red_dingo_invalid_colour");
});

test("Red Dingo refuse le verso d'un modèle simple face", () => {
  const result = quote([{ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Black", frontLines: ["CHIEN"], backLines: ["TEL"] } }]);
  assert.equal(result.error, "red_dingo_back_not_allowed");
});

test("Red Dingo refuse trop de lignes", () => {
  const result = quote([{ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Black", frontLines: ["1", "2", "3", "4"] } }]);
  assert.equal(result.error, "front_too_many_lines");
});

test("Red Dingo refuse une ligne trop longue selon le JSON", () => {
  const tooLong = "X".repeat(engraving.sizes.S.lineCharacterLimits[0] + 1);
  const result = quote([{ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Black", frontLines: [tooLong] } }]);
  assert.equal(result.error, "front_line_too_long");
  assert.equal(result.line, 1);
});

test("les exceptions de gravure par référence sont prises en charge", () => {
  const product = redDingoProduct("01-BN");
  const custom = { ...engraving, referenceOverrides: { "01-BN": { sizes: { S: { lineCharacterLimits: [2] } } } } };
  const { validateRedDingo } = require("../api/_cart");
  assert.equal(validateRedDingo(product, { size: "S", colour: "Black", frontLines: ["ABC"] }, custom).error,
    "front_line_too_long");
});

test("le catalogue de couleurs contient les listes du catalogue Red Dingo", () => {
  assert.equal(colours.enamel.length, 11);
  assert.equal(colours.glitter.length, 7);
});

test("les croquettes sont reconnues mais refusées en V1", () => {
  assert.equal(quote([{ productId: "test-croquettes", quantity: 1 }]).error, "kibble_not_available_v1");
});

for (const quantity of [0, -1, 1.5, 21]) {
  test(`la quantité ${quantity} est refusée`, () => {
    assert.equal(quote([{ productId: "animoco", quantity }]).error, "invalid_quantity");
  });
}

test("la limite de quantité ne se contourne pas avec des lignes dupliquées", () => {
  assert.equal(quote([
    { productId: "animoco", quantity: 20 },
    { productId: "animoco", quantity: 1 }
  ]).error, "invalid_quantity");
});

test("les montants forgés par le navigateur sont ignorés", () => {
  const result = quoteCart({
    items: [{ productId: "animoco", quantity: 1, unitPriceCents: 1, subtotalCents: 1 }],
    shipping: { mode: "animoco-light-fr", priceCents: 1 },
    subtotalCents: 1,
    shippingCents: 1,
    totalCents: 2
  }, { catalog: TEST_CATALOG, shippingConfig: TEST_SHIPPING_CONFIG });
  assert.equal(result.quote.lines[0].unitPriceCents, 1999);
  assert.equal(result.quote.shipping.priceCents, 350);
  assert.equal(result.quote.totalCents, 2349);
});

test("un point relais invalide et une adresse domicile incomplète sont refusés", () => {
  const items = [{ productId: "test-colis", quantity: 1 }];
  assert.equal(quote(items, { mode: "mondial-relay-pickup", relayPoint: { id: "!", address: "x" } }).error,
    "invalid_relay_point");
  assert.equal(quote(items, { mode: "mondial-relay-home", address: { city: "Paris" } }).error,
    "invalid_home_address");
  assert.equal(quote(items, {
    mode: "mondial-relay-home",
    address: { line1: "1 rue Test", postalCode: "1000", city: "Bruxelles", country: "NL" }
  }).error, "unsupported_shipping_country");
});

test("les grilles Production vides échouent explicitement pour un colis", () => {
  const result = quoteCart({
    items: [{ productId: "test-colis", quantity: 1 }],
    shipping: { mode: "mondial-relay-pickup", relayPoint: { id: "FR-123", address: "1 rue Test", country: "FR" } }
  }, { catalog: TEST_CATALOG });
  assert.equal(result.error, "shipping_unavailable");
  assert.deepEqual(result.availableModes, ["pickup"]);
});

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("cart-quote expose uniquement POST, sans cache", () => {
  const methodResponse = responseRecorder();
  cartQuoteHandler({ method: "GET" }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers["Cache-Control"], "no-store");

  const quoteResponse = responseRecorder();
  cartQuoteHandler({
    method: "POST",
    body: { items: [{ productId: "animoco", quantity: 1 }], shipping: { mode: "animoco-light-fr" } }
  }, quoteResponse);
  assert.equal(quoteResponse.statusCode, 200);
  assert.equal(quoteResponse.body.quote.totalCents, 2349);
});

test("cart-quote répond 503 quand Mondial Relay réel est indisponible", () => {
  const response = responseRecorder();
  cartQuoteHandler({
    method: "POST",
    body: {
      items: [{ productId: "animoco", quantity: 3 }],
      shipping: { mode: "mondial-relay-home", address: { line1: "1 rue", postalCode: "75001", city: "Paris", country: "FR" } }
    }
  }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, "shipping_unavailable");
  assert.deepEqual(response.body.availableModes, ["pickup"]);
});
