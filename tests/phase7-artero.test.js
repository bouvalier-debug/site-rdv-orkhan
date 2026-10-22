const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { LEGACY_COSMETICS, cartCatalog, migrateLegacyCosmetics } = require("../api/_cart-catalogue");
const { quoteCartRequest } = require("../api/cart-quote");
const vitrine = require("../api/_vitrine");
const { CATALOG_CONFIG, isLegacyProductId } = require("../api/_catalog");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const artero = (reference, name, cents, extra = {}) => ({
  reference, name, family: "COLIS", description: null, publicPriceCents: cents, familyPriceCents: null, weightGrams: null,
  purchasable: true, maxOrderQuantity: 5, photos: [], shelf: "HYGIENE_SOINS", subcategory: "soins", variantGroup: null, variantLabel: null,
  onRequest: false, isNew: false, availability: "in_stock", listed: true, ...extra
});
const list = (products, available = true) => async () => ({ available, products });

test("les cinq anciens identifiants cosmétiques ont un produit catalogue cible, sans doublon et sans réserver l'ancien préfixe", () => {
  const legacy = CATALOG_CONFIG.parcelProducts.map((product) => product.id).sort();
  assert.deepEqual(Object.keys(LEGACY_COSMETICS).sort(), legacy);
  const targets = Object.values(LEGACY_COSMETICS);
  assert.equal(new Set(targets).size, targets.length);
  for (const target of targets) assert.equal(isLegacyProductId(target), false, target);
});

test("un panier historique bascule vers le catalogue seulement si le produit Artero y est ouvert à l'achat", async () => {
  const items = [{ productId: "cosmetics:block", quantity: 2 }];
  const open = await cartCatalog(items, { listCatalogue: list([artero("artero-block", "Artero Block", 2140)]) });
  assert.deepEqual(open.items, [{ productId: "artero-block", quantity: 2 }]);
  assert.ok(open.catalog.has("artero-block"));
  const closed = await cartCatalog(items, { listCatalogue: list([artero("artero-block", "Artero Block", 2140, { purchasable: false })]) });
  assert.equal(closed.items, undefined, "produit non ouvert : parcours historique inchangé");
  const missing = await cartCatalog(items, { listCatalogue: list([]) });
  assert.equal(missing.items, undefined);
  const down = await cartCatalog(items, { listCatalogue: list([], false) });
  assert.deepEqual(down, {}, "un panier historique ne dépend pas du Manager");
  assert.deepEqual(await cartCatalog([{ productId: "animoco", quantity: 1 }], { listCatalogue: async () => assert.fail("aucun appel Manager") }), {});
  assert.equal((await cartCatalog([{ productId: "artero-block", quantity: 1 }], { listCatalogue: list([], false) })).error, "catalogue_unavailable");
  assert.equal(migrateLegacyCosmetics(items, []), items);
});



test("fiche Artero : prix, ajout au panier, description structurée et retrait comme les autres produits du catalogue", () => {
  const html = vitrine.renderFiche({ available: true, products: [artero("artero-samba", "Artero Samba", 1145, { description: "Serviette.\n\nConseils d'utilisation :\n- Après le bain" })] }, "artero-samba");
  assert.match(html, /data-fiche-add/);
  assert.match(html, /11,45/);
  assert.match(html, /<h3>Conseils d&#39;utilisation<\/h3><ul><li>Après le bain<\/li><\/ul>/);
  assert.match(html, /Retrait gratuit à l’élevage/);
});

test("les photos de repli Artero existent et la photo du pack est optimisée", () => {
  for (const photos of Object.values(vitrine.ARTERO_PHOTOS)) for (const [url] of photos) assert.ok(fs.existsSync(path.join(__dirname, "..", url.replace(/^\//, ""))), url);
  assert.ok(fs.statSync(path.join(__dirname, "..", "assets/artero/routine-ete-artero.webp")).size < 400000);
});


test("devis : une ancienne ligne cosmetics:* bascule vers le catalogue (prix, stock, retrait seul) quand le produit est ouvert à l'achat", async () => {
  const input = { items: [{ productId: "cosmetics:block", quantity: 2 }], shipping: { mode: "pickup", pickupTiming: "appointment" } };
  const catalogue = list([artero("artero-block", "Artero Block", 2200, { maxOrderQuantity: 5 })]);
  const result = await quoteCartRequest(input, { listCatalogue: catalogue });
  assert.deepEqual(result.quote.lines.map((line) => [line.productId, line.unitPriceCents, line.subtotalCents]), [["artero-block", 2200, 4400]]);
  assert.deepEqual(result.quote.availableShippingModes, ["pickup"]);
  assert.equal((await quoteCartRequest({ ...input, items: [{ productId: "cosmetics:block", quantity: 6 }] }, { listCatalogue: catalogue })).error, "out_of_stock");
});

test("rayon Hygiène et soins : produits Artero du catalogue avec photos d'origine en repli, photos du Manager prioritaires", () => {
  const products = [artero("artero-block", "Artero Block", 2140), artero("artero-dfender", "Artero Dfender", 2265, { photos: [{ url: "/api/catalogue-photo?id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", width: 800, height: 800, altText: "Manager" }] })];
  const html = vitrine.renderRayon({ available: true, products }, "hygiene-et-soins");
  assert.match(html, /\/cosmetiques\/assets\/artero-block\.webp/);
  assert.match(html, /catalogue-photo\?id=aaaaaaaa/);
  assert.doesNotMatch(html, /Cosmétiques Artero/);
});

test("transition /cosmetiques/ : redirection 301 préparée mais non activée", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.redirects.some((entry) => entry.source === "/cosmetiques" || entry.source === "/cosmetiques/"), false);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "cosmetiques/index.html")));
  const plan = JSON.parse(read("seo/phase7-bascule.json"));
  assert.equal(plan.redirects[1].destination, "/rayons/hygiene-et-soins/");
});
