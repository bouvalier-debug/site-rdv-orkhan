const test = require("node:test");
const assert = require("node:assert/strict");
const { isNouveaute, publicProduct } = require("../api/_orkhan-catalog");
const { quoteCartRequest } = require("../api/cart-quote");
const productsHandler = require("../api/catalogue-produits");

// Phase 3.2 : lecture des champs ajoutés par le Manager (rayons, variantes, Nouveautés, Sur demande, disponibilité).
const BASE = { reference: "jouet-corde-grand", name: "Jouet corde", family: "COLIS", publicPriceCents: 900, familyPriceCents: null, weightGrams: 200, photos: [],
  purchasable: true, maxOrderQuantity: 4, shelf: "JOUETS", subcategory: "jouets-a-macher", variantGroup: "jouet-corde", variantLabel: "Grand",
  onRequest: false, isNew: true, availability: "in_stock", listed: true };
const product = (changes = {}) => publicProduct({ ...BASE, ...changes });

test("lit rayon, variante, Nouveauté, disponibilité et visibilité, avec des valeurs sûres", () => {
  assert.deepEqual(
    (({ shelf, subcategory, variantGroup, variantLabel, onRequest, isNew, availability, listed }) => ({ shelf, subcategory, variantGroup, variantLabel, onRequest, isNew, availability, listed }))(product()),
    { shelf: "JOUETS", subcategory: "jouets-a-macher", variantGroup: "jouet-corde", variantLabel: "Grand", onRequest: false, isNew: true, availability: "in_stock", listed: true }
  );
  assert.equal(product({ shelf: "NOUVEAUTES" }).shelf, null);
  assert.equal(product({ shelf: "NOUVEAUTES" }).subcategory, null);
  assert.deepEqual([product({ variantGroup: "Jouet Corde" })].map((p) => [p.variantGroup, p.variantLabel]), [[null, null]]);
  assert.equal(product({ availability: "<script>" }).availability, null);
  assert.equal(product({ listed: "false" }).listed, false);
});

test("un produit Sur commande est achetable seulement si le Manager l'a ouvert à l'achat", () => {
  assert.deepEqual([product({ onRequest: true, purchasable: true, maxOrderQuantity: 20 }), product({ onRequest: true, purchasable: false, maxOrderQuantity: 20 })]
    .map((p) => [p.purchasable, p.maxOrderQuantity]), [[true, 20], [false, 0]]);
});

test("la date de publication est utilisée si le Manager l'expose, jamais la date de création", () => {
  assert.equal(product({ firstPublishedAt: "2026-10-24T10:00:00.000Z" }).publishedAt, "2026-10-24T10:00:00.000Z");
  assert.equal(product({ publishedAt: "2026-10-25T10:00:00.000Z" }).publishedAt, "2026-10-25T10:00:00.000Z");
  assert.equal(product({ createdAt: "2026-10-26T10:00:00.000Z" }).publishedAt, null);
});

test("un Manager antérieur à la phase 3 garde l'affichage actuel", () => {
  const legacy = { ...BASE };
  for (const key of ["shelf", "subcategory", "variantGroup", "variantLabel", "onRequest", "isNew", "availability", "listed"]) delete legacy[key];
  const read = publicProduct(legacy);
  assert.deepEqual([read.listed, read.isNew, read.onRequest, read.purchasable], [true, true, false, true]);
  assert.equal(isNouveaute(read), true);
});

test("Nouveautés : visibles, de moins de 14 jours et hors Sur demande ; un produit en vente sans stock reste affiché", async () => {
  const products = [
    BASE,
    { ...BASE, reference: "ancien", isNew: false },
    { ...BASE, reference: "masque", purchasable: false, listed: false },
    { ...BASE, reference: "vitrine", purchasable: false, onRequest: true, availability: "on_request" },
    { ...BASE, reference: "rupture", maxOrderQuantity: 0, availability: "out_of_stock" }
  ];
  const saved = { fetch: global.fetch, url: process.env.ORKHAN_MANAGER_URL, secret: process.env.ORKHAN_SHOP_ORDERS_SECRET };
  process.env.ORKHAN_MANAGER_URL = "https://manager-preview.example"; process.env.ORKHAN_SHOP_ORDERS_SECRET = "secret-test";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, products }) });
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try { await productsHandler({ method: "GET" }, res); } finally {
    global.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.ORKHAN_MANAGER_URL; else process.env.ORKHAN_MANAGER_URL = saved.url;
    if (saved.secret === undefined) delete process.env.ORKHAN_SHOP_ORDERS_SECRET; else process.env.ORKHAN_SHOP_ORDERS_SECRET = saved.secret;
  }
  assert.deepEqual(res.body.products.map((item) => item.reference), ["jouet-corde-grand", "rupture"]);
});

test("devis : Sur commande fermé à l'achat refusé côté serveur ; chaque variante garde sa référence, son prix et son stock", async () => {
  const catalogue = [
    product({ reference: "croquettes-1-5kg", name: "Croquettes", family: "CROQUETTES", publicPriceCents: 1490, maxOrderQuantity: 2, variantGroup: "croquettes", variantLabel: "1,5 kg", shelf: "ALIMENTATION", subcategory: "croquettes" }),
    product({ reference: "croquettes-10kg", name: "Croquettes", family: "CROQUETTES", publicPriceCents: 6490, maxOrderQuantity: 1, variantGroup: "croquettes", variantLabel: "10 kg", shelf: "ALIMENTATION", subcategory: "croquettes" }),
    product({ reference: "vitrine-test", purchasable: false, onRequest: true, maxOrderQuantity: 5 })
  ];
  const quote = (items) => quoteCartRequest({ items, shipping: { mode: "pickup", pickupTiming: "appointment" } }, {
    listCatalogue: async () => ({ available: true, products: catalogue }),
    verifyFamilyChip: async () => ({ status: "ok", recognized: false })
  });
  assert.equal((await quote([{ productId: "vitrine-test", quantity: 1 }])).error, "product_not_purchasable");
  const both = await quote([{ productId: "croquettes-1-5kg", quantity: 2 }, { productId: "croquettes-10kg", quantity: 1 }]);
  assert.equal(both.error, undefined);
  assert.equal(both.quote.totalCents, 2 * 1490 + 6490);
  assert.equal((await quote([{ productId: "croquettes-10kg", quantity: 2 }])).error, "out_of_stock");
});
