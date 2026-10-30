const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicProduct } = require("../api/_orkhan-catalog");
const { quoteCartRequest } = require("../api/cart-quote");
const { ON_REQUEST_NOTICE, renderFiche, renderRayon, renderSurDemande } = require("../api/_vitrine");

// Produits « Sur commande » achetables : règle générale tirée du Manager (onRequest + ouvert à l'achat), sans stock.
const BASE = { family: "COLIS", publicPriceCents: 13490, familyPriceCents: 12990, weightGrams: 1500, photos: [], purchasable: true,
  shelf: "HYGIENE_SOINS", subcategory: "outils-de-toilettage", variantGroup: null, variantLabel: null, onRequest: false, isNew: false, listed: true };
const product = (changes) => publicProduct({ ...BASE, ...changes });
const SECHOIR = product({ reference: "sechoir-test", name: "Séchoir test", onRequest: true, availability: "on_request", maxOrderQuantity: 20 });
const BROSSE = product({ reference: "brosse-test", name: "Brosse test", publicPriceCents: 900, familyPriceCents: null, availability: "in_stock", maxOrderQuantity: 3 });
const PEIGNE = product({ reference: "peigne-test", name: "Peigne test", publicPriceCents: 700, familyPriceCents: null, availability: "out_of_stock", maxOrderQuantity: 0 });
const VITRINE = product({ reference: "vitrine-test", name: "Vitrine test", onRequest: true, purchasable: false, availability: "on_request" });
const catalogue = { available: true, products: [SECHOIR, BROSSE, PEIGNE, VITRINE] };
const variantsOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="fiche-variants">(.*?)<\/script>/s)[1]);
const NOTICE_TEXT = "Cet article est disponible sur commande, sous réserve de disponibilité auprès de notre fournisseur.";

test("fiche Sur commande : prix, mention « Sur commande », quantités, ajout au panier et message obligatoire près du bouton", () => {
  const html = renderFiche(catalogue, "sechoir-test");
  assert.match(html, /data-fiche-price>134,90/);
  assert.match(html, /<p class="availability availability-on_request" data-fiche-availability>Sur commande<\/p>/);
  assert.doesNotMatch(html, /Rupture de stock|non achetable directement/);
  assert.match(html, /<input type="number" data-fiche-quantity min="1" max="20" value="1"><\/label><button type="button" class="btn-primary" data-fiche-add>Ajouter au panier<\/button><\/div><div class="fiche-on-request" data-fiche-on-request>/);
  assert.equal(variantsOf(html)[0].maxQuantity, 20);
  assert.deepEqual(ON_REQUEST_NOTICE, ["Produit sur commande", NOTICE_TEXT,
    "La date de disponibilité pour le retrait à l'élevage vous sera communiquée par SMS ou par e-mail."]);
  assert.ok(html.includes(`<p><strong>Produit sur commande</strong></p><p>${NOTICE_TEXT}</p><p>La date de disponibilité pour le retrait à l&#39;élevage vous sera communiquée par SMS ou par e-mail.</p>`));
  assert.doesNotMatch(html, /jeudi|vendredi/i);
});

test("produits ordinaires inchangés : vraie rupture non achetable, sans message Sur commande", () => {
  const rupture = renderFiche(catalogue, "peigne-test");
  assert.match(rupture, />Rupture de stock</);
  assert.match(rupture, /data-fiche-add disabled/);
  assert.equal(variantsOf(rupture)[0].maxQuantity, 0);
  assert.doesNotMatch(rupture, /data-fiche-on-request/);
  assert.equal(variantsOf(renderFiche(catalogue, "brosse-test"))[0].maxQuantity, 3);
});

test("rayon habituel et rubrique « Produits sur commande » ; un Sur commande fermé à l'achat reste une vitrine", () => {
  const rayon = renderRayon(catalogue, "hygiene-et-soins");
  assert.match(rayon, /href="\/produits\/sechoir-test\/"/);
  assert.match(rayon, /Séchoir test<\/a><\/h3><p class="product-price">134,90/);
  assert.doesNotMatch(rayon, /vitrine-test/);
  const rubrique = renderSurDemande(catalogue);
  assert.match(rubrique, /href="\/produits\/sechoir-test\/"/);
  assert.match(rubrique, /href="\/produits\/vitrine-test\/"/);
  const vitrine = renderFiche(catalogue, "vitrine-test");
  assert.match(vitrine, /non achetable directement en ligne/);
  assert.doesNotMatch(vitrine, /data-fiche-add/);
});

test("panier mixte : devis accepté, ligne Sur commande signalée ; rupture réelle et produit fermé refusés", async () => {
  const quote = (items) => quoteCartRequest({ items, shipping: { mode: "pickup", pickupTiming: "appointment" } }, {
    listCatalogue: async () => catalogue,
    verifyFamilyChip: async () => ({ status: "ok", recognized: false })
  });
  const mixed = await quote([{ productId: "sechoir-test", quantity: 3 }, { productId: "brosse-test", quantity: 2 }]);
  assert.equal(mixed.error, undefined);
  assert.equal(mixed.quote.totalCents, 3 * 13490 + 2 * 900);
  assert.deepEqual(mixed.quote.lines.map((line) => [line.productId, line.onRequest === true]), [["sechoir-test", true], ["brosse-test", false]]);
  assert.equal((await quote([{ productId: "sechoir-test", quantity: 21 }])).error, "invalid_quantity");
  assert.equal((await quote([{ productId: "sechoir-test", quantity: 1 }, { productId: "peigne-test", quantity: 1 }])).error, "out_of_stock");
  assert.equal((await quote([{ productId: "vitrine-test", quantity: 1 }])).error, "product_not_purchasable");
});

test("la commande transmise au Manager ne contient que les champs habituels ; rappel au panier avant le paiement", () => {
  const root = path.join(__dirname, "..");
  const checkout = fs.readFileSync(path.join(root, "api/_checkout.js"), "utf8");
  assert.match(checkout, /function orderLines\(lines\) \{\s+return lines\.map\(\(line\) => \(\{\s+productId: line\.productId,\s+name: line\.name,\s+quantity: line\.quantity,\s+unitPriceCents: line\.unitPriceCents,\s+subtotalCents: line\.subtotalCents,/);
  const panier = fs.readFileSync(path.join(root, "panier/index.html"), "utf8");
  assert.ok(panier.includes(`<div class="on-request-notice" data-on-request-notice hidden><p><strong>Produit sur commande</strong></p><p>${NOTICE_TEXT}</p><p>La date de disponibilité pour le retrait à l'élevage vous sera communiquée par SMS ou par e-mail.</p></div>`));
  assert.ok(panier.indexOf("data-on-request-notice") < panier.indexOf("data-checkout-button"));
  const cart = fs.readFileSync(path.join(root, "assets/cart.js"), "utf8");
  assert.match(cart, /onRequestNotice\.hidden = !quote\?\.lines\?\.some\(\(line\) => line\.onRequest\)/);
  assert.match(cart, /if \(serverLine\?\.onRequest\) info\.append\(element\(document, "p", "on-request-line", "Produit sur commande"\)\)/);
});
