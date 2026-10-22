// Retrait des cosmétiques Artero de la vente : l'interrupteur de test ORKHAN_LEGACY_COSMETICS_FOR_SALE n'est pas posé ici.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { quoteCartRequest } = require("../api/cart-quote");
const { executeCheckout } = require("../api/_checkout");
const vitrine = require("../api/_vitrine");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const none = async () => ({ available: true, products: [] });
const pickup = { mode: "pickup", pickupTiming: "appointment" };
const ARTERO_IDS = ["cosmetics:block", "cosmetics:bye-bye", "cosmetics:samba", "cosmetics:dfender", "cosmetics:pack-ete"];

test("côté serveur : toute ancienne référence cosmetics:* est refusée au devis, y compris depuis un ancien panier", async () => {
  assert.equal(process.env.ORKHAN_LEGACY_COSMETICS_FOR_SALE, undefined);
  for (const productId of ARTERO_IDS) {
    const result = await quoteCartRequest({ items: [{ productId, quantity: 1 }], shipping: pickup }, { listCatalogue: none });
    assert.equal(result.error, "product_not_purchasable", productId);
  }
  const mixed = await quoteCartRequest({ items: [{ productId: "animoco", quantity: 1 }, { productId: "cosmetics:samba", quantity: 1 }], shipping: pickup }, { listCatalogue: none });
  assert.equal(mixed.error, "product_not_purchasable", "un seul article Artero bloque le panier");
});

test("côté serveur : la commande est refusée avant toute création de commande ou de paiement", async () => {
  const calls = [];
  const deps = {
    cartCatalog: async () => ({}),
    manager: { createOrder: async () => { calls.push("order"); throw new Error("ne doit pas être appelé"); } },
    payment: { createCheckout: async () => { calls.push("payment"); } },
    origin: "https://boutique.test"
  };
  const result = await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000",
    items: [{ productId: "cosmetics:block", quantity: 1 }],
    shipping: pickup,
    customer: { firstName: "T", lastName: "T", email: "t@example.test", phone: "0600000000", country: "FR", address: "", addressExtra: "", postalCode: "", city: "" },
    legalAcceptance: { version: "cgv-2026-10-21-3", accepted: true }
  }, deps);
  assert.equal(result.error, "product_not_purchasable");
  assert.equal(result.status, 409);
  assert.deepEqual(calls, []);
});

test("les autres produits restent achetables : Animoco et produit du catalogue", async () => {
  const animoco = await quoteCartRequest({ items: [{ productId: "animoco", quantity: 1 }], shipping: pickup }, { listCatalogue: none });
  assert.equal(animoco.error, undefined);
  assert.equal(animoco.quote.lines[0].unitPriceCents, 1999);
  const product = { reference: "shampoing-test", name: "Shampoing", family: "COLIS", publicPriceCents: 1500, familyPriceCents: null, weightGrams: 400, purchasable: true, maxOrderQuantity: 5, photos: [], shelf: "HYGIENE_SOINS", subcategory: "shampooings", variantGroup: null, variantLabel: null, onRequest: false, isNew: false, availability: "in_stock", listed: true };
  const catalogue = await quoteCartRequest({ items: [{ productId: "shampoing-test", quantity: 2 }], shipping: pickup }, { listCatalogue: async () => ({ available: true, products: [product] }) });
  assert.equal(catalogue.quote.totalCents, 3000);
});

test("un ancien panier Artero affiche le refus existant et ne peut pas aller au paiement", () => {
  const { quoteStatusMessage } = require("../assets/cart");
  assert.match(quoteStatusMessage({ error: "product_not_purchasable" }), /n’est plus en vente\. Retirez-le du panier/);
  assert.match(read("assets/cart.js"), /checkoutButton\.disabled = !quote/);
});

test("vitrine : plus d'accès Cosmétiques Artero, page /cosmetiques/ sans bouton d'achat et hors index, sitemap sans cosmétiques", () => {
  const catalogue = { available: true, products: [] };
  for (const html of [vitrine.renderRayon(catalogue, "hygiene-et-soins"), vitrine.renderAccueil(catalogue)]) assert.doesNotMatch(html, /Cosmétiques Artero|href="\/cosmetiques\/"/);
  const page = read("cosmetiques/index.html");
  assert.doesNotMatch(page, /<button type="button" data-add=/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(page, /ne sont pas disponibles à la vente pour le moment/);
  assert.doesNotMatch(read("seo/sitemap-boutique.xml"), /cosmetiques/);
});

test("conservation : les produits historiques restent dans le code (commandes historiques) et la future remise en vente reste possible", () => {
  const { CATALOG_CONFIG } = require("../api/_catalog");
  assert.equal(CATALOG_CONFIG.parcelProducts.filter((product) => product.id.startsWith("cosmetics:")).length, 5);
  assert.ok(Object.keys(require("../api/_cart-catalogue").LEGACY_COSMETICS).length === 5);
});
