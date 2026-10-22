const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCartStore, deliveryDelayLines, PICKUP_APPOINTMENT_NOTE } = require("../assets/cart");
const { addLineGuarded, mixConflict } = require("../assets/product-cart");
const vitrine = require("../api/_vitrine");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }; };
const RED = { productId: "red-dingo:01-PP", quantity: 1, options: { size: "S" } };
const OTHER = { productId: "cosmetics:shampoing", quantity: 1 };

function fakeButton() {
  const created = [];
  const document = { createElement: (tag) => ({ tag, children: [], className: "", append(...nodes) { this.children.push(...nodes); }, setAttribute() {}, addEventListener(type, handler) { this.handler = handler; }, remove() { this.removed = true; } }) };
  const button = { ownerDocument: document, parentNode: { querySelectorAll: () => [] }, insertAdjacentElement(position, node) { created.push(node); } };
  return { button, created };
}

test("A1 : Red Dingo et autres articles ne se mélangent pas, dans les deux sens", () => {
  const withOther = createCartStore({ storage: memoryStorage() });
  withOther.add(OTHER);
  assert.equal(mixConflict(withOther, RED), "cart-has-other");
  const withRed = createCartStore({ storage: memoryStorage() });
  withRed.add(RED);
  assert.equal(mixConflict(withRed, OTHER), "cart-has-red-dingo");
  assert.equal(mixConflict(withRed, { productId: "red-dingo:01-AN", quantity: 1 }), null, "plusieurs Red Dingo restent possibles");
  assert.equal(mixConflict(createCartStore({ storage: memoryStorage() }), RED), null);
});

test("A1 : en cas de mélange, rien n'est supprimé sans confirmation explicite ; « Conserver » laisse le panier intact, « Remplacer » le remplace", () => {
  const store = createCartStore({ storage: memoryStorage() });
  store.add(OTHER);
  const { button, created } = fakeButton();
  let added = 0;
  assert.equal(addLineGuarded(store, RED, { button, onAdded: () => { added += 1; } }), "conflict");
  assert.equal(store.getItems().length, 1);
  assert.equal(added, 0);
  const [panel] = created;
  const [message, actions] = panel.children;
  assert.match(message.textContent, /expédiées directement par Red Dingo/);
  const [keep, replace] = actions.children;
  assert.equal(keep.textContent, "Conserver mon panier actuel");
  keep.handler();
  assert.deepEqual(store.getItems().map((item) => item.productId), ["cosmetics:shampoing"]);
  addLineGuarded(store, RED, { button, onAdded: () => { added += 1; } });
  created[1].children[1].children[1].handler();
  assert.deepEqual(store.getItems().map((item) => item.productId), ["red-dingo:01-PP"]);
  assert.equal(added, 1);
});

test("A1 : tous les points d'ajout (fiche produit, Red Dingo, Animoco, cosmétiques) passent par la vérification", () => {
  for (const file of ["assets/vitrine.js", "medailles-gravees/index.html", "medailles-connectees/order.js", "cosmetiques/index.html"]) {
    assert.match(read(file), /addLineGuarded\(/, file);
    assert.doesNotMatch(read(file), /OrkhanProductCart\.addLine\(|productCart\.addLine\(/, file);
  }
});

test("A2 : les lignes s'affichent avant le devis, avec un nom de repli et un prix « non calculé » en cas d'échec ; panier vide = paiement bloqué", () => {
  const source = read("assets/cart.js");
  assert.match(source, /renderLines\(items, lastResult\?\.quote\?\.lines\?\.length === items\.length \? lastResult\.quote : null, "pending"\)/);
  assert.match(source, /renderLines\(items, quote, "failed"\)/);
  assert.match(source, /"Prix non calculé"/);
  assert.match(source, /container\.toggleAttribute\("data-empty", !items\.length\)/);
  assert.match(source, /if \(checkoutButton\) checkoutButton\.disabled = true;\n/);
  assert.match(read("panier/index.html"), /\[data-cart-page\]\[data-empty\] \.customer-card,\[data-cart-page\]\[data-empty\] \.cart-summary\{display:none\}/);
});

test("A4 : le pays est masqué en retrait gratuit seul et revient avec une expédition", () => {
  assert.match(read("assets/cart.js"), /ADDRESS_FIELDS\.includes\(field\.name\) \|\| field\.name === "country"\) field\.closest\("label"\)\.hidden = pickup/);
});

test("A5 A6 : retrait sur rendez-vous expliqué sans formulaire de visite, aucune promesse de délai de retrait", () => {
  assert.match(PICKUP_APPOINTMENT_NOTE, /date de retrait sera convenue avec vous après votre commande/);
  assert.deepEqual(deliveryDelayLines({ hasRedDingo: false, hasOther: true, mode: "pickup" }), []);
  const page = read("panier/index.html");
  assert.doesNotMatch(page, /Disponible à l’élevage sous 24 h/);
  assert.doesNotMatch(read("assets/cart.js"), /Disponible à l’élevage sous 24/);
  assert.doesNotMatch(read("assets/cart.js"), /demande-de-rdv/);
});

test("A7 : les précisions Red Dingo du panier ne s'affichent que pour une commande Red Dingo", () => {
  assert.match(read("panier/index.html"), /<span data-red-dingo-only hidden>/);
  assert.match(read("assets/cart.js"), /querySelectorAll\("\[data-red-dingo-only\]"\)\.forEach\(\(node\) => \{ node\.hidden = !hasRedDingo; \}\)/);
});

test("B4 B5 : « Produits sur commande » et photo à venir compacte", () => {
  const html = vitrine.renderSurDemande({ available: true, products: [] });
  assert.match(html, /<h1>Produits sur commande<\/h1>/);
  assert.doesNotMatch(html, /<h1>Sur demande<\/h1>/);
  const { SHOP_HEADER } = require("../scripts/shop-layout");
  assert.ok(SHOP_HEADER.includes('<a href="/sur-demande/">Produits sur commande</a>'), "la route /sur-demande/ est conservée");
  assert.match(read("api/_vitrine.js"), /<span class="product-tile-placeholder">Photo à venir<\/span>/);
  assert.match(read("assets/vitrine.css"), /\.product-tile-photo:has\(\.product-tile-placeholder\)\{aspect-ratio:auto;height:76px\}/);
});

test("B6 : la description du Manager reste un seul champ, présenté en paragraphes, intertitres et listes", () => {
  assert.equal(vitrine.descriptionHtml("Texte\nsuite\n\nComposition :\n- poulet\n- riz\n\n<b>x</b>"),
    "<p>Texte<br>suite</p><h3>Composition</h3><ul><li>poulet</li><li>riz</li></ul><p>&lt;b&gt;x&lt;/b&gt;</p>");
});

test("B7 : le guide des tailles est près du sélecteur de taille, discret, limité aux médailles rondes émaillées", () => {
  const html = read("medailles-gravees/index.html");
  const guide = html.indexOf('<details class="full size-guide">');
  assert.ok(guide > html.indexOf('name="taille"') && guide < html.indexOf('id="gravure-recto"'));
  assert.match(html, /médailles rondes émaillées Red Dingo ; d’autres formes peuvent avoir des dimensions et un poids différents/);
  for (const size of ["20 mm", "30 mm", "38 mm"]) assert.ok(html.includes(size), size);
});

test("D3 : bannières de rayons = photo entière (jamais recadrée) à côté du titre, accueil inchangé", () => {
  const css = read("assets/vitrine.css");
  assert.match(css, /\.vitrine>\.hero\.hero-compact\{display:flex!important;[^}]*background-image:none!important/);
  assert.match(css, /\.hero-banner\{[^}]*aspect-ratio:2032\/774/);
  assert.doesNotMatch(css, /background-position:center 20%/);
  const html = vitrine.renderRayon({ available: true, products: [] }, "identification");
  assert.match(html, /<img class="hero-banner" src="\/assets\/banniere-dynastie-orkhan\.webp"[^>]*width="2032" height="774"/);
  assert.doesNotMatch(vitrine.renderAccueil({ available: true, products: [] }), /hero-banner/, "l'accueil garde sa bannière validée");
});

test("D4 : panier vide = un seul bouton « Continuer mes achats » vers Nos rayons", () => {
  const page = read("panier/index.html");
  assert.match(page, /<p class="cart-actions"><a href="\/#rayons-title">Continuer mes achats<\/a><\/p>/);
  assert.doesNotMatch(page, /Médailles Red Dingo<\/a> ·/);
  assert.match(vitrine.renderAccueil({ available: true, products: [] }), /<h2 id="rayons-title">Nos rayons<\/h2>/);
});

test("D5 : formulation unique de « Produits sur commande » avec lien vers Contact", () => {
  const text = "Découvrez les produits proposés sur commande. Pour connaître les disponibilités et les modalités, ";
  for (const html of [vitrine.renderAccueil({ available: true, products: [] }), vitrine.renderSurDemande({ available: true, products: [] })]) {
    assert.ok(html.includes(text + '<a href="https://www.dynastiedorkhan.com/contact/">contactez l’élevage</a>.'));
    assert.doesNotMatch(html, /non achetables directement en ligne\./);
  }
});

test("D1 D2 : pied de page et marque communs", () => {
  const { SHOP_FOOTER, SHOP_HEADER } = require("../scripts/shop-layout");
  assert.match(SHOP_FOOTER, /<p class="nowrap">SIRET : 421 173 824 00028<\/p>/);
  for (const part of ['class="footer-id"', 'aria-label="Espaces du site"', 'aria-label="Informations légales"', "/conditions-generales-de-vente/", "/contact/", "/documents-elevage/"]) assert.ok(SHOP_FOOTER.includes(part), part);
  assert.ok(SHOP_HEADER.includes("<span><strong>Dynastie d’Orkhan</strong><small>La boutique</small></span>"));
  assert.match(read("assets/orkhan-design.css"), /\.shop-brand strong\{color:var\(--wine\);font-family:"Lora",Georgia,serif;font-size:1\.08rem;font-weight:700\}/);
});

test("B7 : le guide utilise les trois photographies originales Red Dingo (rondes émaillées S, M, L)", () => {
  const html = read("medailles-gravees/index.html");
  for (const size of ["s", "m", "l"]) {
    const file = `medailles-gravees/assets/guide-taille-${size}-medaille-ronde.webp`;
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), file);
    assert.ok(html.includes(`src="/${file}"`), file);
  }
  assert.doesNotMatch(html, /class="size-model/);
  assert.match(read("assets/orkhan-design.css"), /\.size-guide \.size-photo\{[^}]*max-width:220px/);
});
