// Ajout rapide au panier depuis les cartes produits (produits sans choix préalable), avec le panier commun existant.
const test = require("node:test");
const assert = require("node:assert/strict");
const vitrine = require("../api/_vitrine");
const { publicProduct } = require("../api/_orkhan-catalog");
const cart = require("../assets/cart");
const productCart = require("../assets/product-cart");
const { cartState, quickAddClick } = require("../assets/quick-add");

const product = (reference, extra = {}) => publicProduct({
  reference, name: `Produit ${reference}`, family: "COLIS", publicPriceCents: 550, weightGrams: 100, purchasable: true, maxOrderQuantity: 3,
  photos: [], shelf: "ALIMENTATION", subcategory: "friandises", isNew: false, availability: "in_stock", listed: true, ...extra
});
const quickRef = (fiche) => (vitrine.ficheCard(fiche).match(/data-quick-add="([^"]+)"/) || [])[1] || null;

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

// Bouton et document minimaux pour exercer le gestionnaire réel.
function fakeButton(reference, max) {
  const status = { textContent: "", dataset: {} };
  const tile = { querySelector: () => status };
  const button = { dataset: { quickAdd: reference, quickMax: String(max) }, classList: { add() {}, remove() {} }, closest: () => tile, ownerDocument: null, parentNode: null };
  return { button, status };
}

test("éligibilité : produits simples, sur commande achetable, un seul format commandable ; jamais en rupture ni avec un choix", () => {
  const fiches = vitrine.buildFiches([
    product("soopa"),
    product("sechoir", { onRequest: true, availability: "on_request", maxOrderQuantity: 2 }),
    product("vitrine", { onRequest: true, purchasable: false }),
    product("rupture", { availability: "out_of_stock", maxOrderQuantity: 0 }),
    product("collier-s", { variantGroup: "collier", variantLabel: "S" }), product("collier-m", { variantGroup: "collier", variantLabel: "M" }),
    product("croq-2kg", { variantGroup: "croq", variantLabel: "2 kg" }), product("croq-10kg", { variantGroup: "croq", variantLabel: "10 kg", availability: "out_of_stock", maxOrderQuantity: 0 })
  ]);
  const bySlug = Object.fromEntries(fiches.map((fiche) => [fiche.slug, quickRef(fiche)]));
  assert.deepEqual(bySlug, { soopa: "soopa", sechoir: "sechoir", vitrine: null, rupture: null, collier: null, croq: "croq-2kg" });
  const card = vitrine.ficheCard(fiches[0]);
  assert.match(card, /aria-label="Ajouter au panier : Produit soopa">Ajouter au panier<\/button><a class="btn-voir" href="\/produits\/soopa\/">Voir le produit<\/a>/);
  assert.match(card, /data-quick-status role="status" aria-live="polite"/);
  // Médailles : parcours dédiés, jamais d'ajout rapide.
  assert.doesNotMatch(vitrine.renderRayon({ available: true, products: [] }, "identification"), /data-quick-add/);
});

test("le script d'ajout rapide n'est chargé que sur les pages qui en ont besoin, avec le module d'ajout existant", () => {
  const page = vitrine.renderAlimentation({ available: true, products: [product("soopa", { brand: "SOOPA" })], brandCards: null }, "friandises");
  assert.match(page, /<script src="\/assets\/product-cart\.js"><\/script>\n<script src="\/assets\/quick-add\.js" defer><\/script>/);
  const fiche = vitrine.renderFiche({ available: true, products: [product("soopa")] }, "soopa");
  assert.doesNotMatch(fiche, /quick-add\.js/);
  assert.equal((fiche.match(/product-cart\.js/g) || []).length, 1);
});

test("un clic ajoute une unité au panier commun ; les clics suivants augmentent la quantité jusqu'au maximum disponible", () => {
  const storage = memoryStorage();
  const documentStub = { querySelectorAll: () => [] };
  const cartApi = { ...cart, createCartStore: () => cart.createCartStore({ storage }) };
  const { button, status } = fakeButton("soopa", 3);
  for (let click = 0; click < 3; click += 1) quickAddClick(button, { cart: cartApi, productCart, document: documentStub });
  const items = cart.createCartStore({ storage }).getItems();
  assert.deepEqual(items.map((item) => [item.productId, item.quantity]), [["soopa", 3]], "une seule ligne, quantité 3");
  assert.equal(status.textContent, "Ajouté au panier");
  quickAddClick(button, { cart: cartApi, productCart, document: documentStub });
  assert.equal(cart.createCartStore({ storage }).getItems()[0].quantity, 3, "jamais au-delà du stock commandable");
  assert.equal(status.textContent, "Quantité maximale disponible déjà au panier.");
  assert.deepEqual(cartState(items, "soopa"), { quantity: 3, line: items[0] });
});

test("panier contenant une médaille Red Dingo : même contrôle que sur la fiche (rien n'est ajouté sans accord)", () => {
  const storage = memoryStorage();
  const store = cart.createCartStore({ storage });
  store.add({ productId: "red-dingo:01-EL", quantity: 1, options: { size: "S", colour: "Light Blue", frontLines: ["ORKHAN"] } });
  const inserted = [];
  const documentStub = { querySelectorAll: () => [], createElement: (tag) => ({ tag, className: "", children: [], setAttribute() {}, append(...nodes) { this.children.push(...nodes); }, addEventListener() {}, set textContent(value) { this.text = value; } }) };
  const { button } = fakeButton("soopa", 3);
  Object.assign(button, { ownerDocument: documentStub, parentNode: { querySelectorAll: () => [] }, insertAdjacentElement: (_, node) => inserted.push(node) });
  const outcome = quickAddClick(button, { cart: { ...cart, createCartStore: () => cart.createCartStore({ storage }) }, productCart, document: documentStub });
  assert.equal(outcome, "conflict");
  assert.equal(inserted.length, 1);
  assert.deepEqual(cart.createCartStore({ storage }).getItems().map((item) => item.productId), ["red-dingo:01-EL"]);
});
