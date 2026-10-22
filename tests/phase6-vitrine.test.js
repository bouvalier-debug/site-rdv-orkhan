const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicProduct } = require("../api/_orkhan-catalog");
const vitrine = require("../api/_vitrine");
const handler = require("../api/vitrine");
const { RAYONS, SHOP_HEADER } = require("../scripts/shop-layout");

// Phase 6 : accueil, rayons, Sur demande, cartes compactes (C1–C4) et fiches à variantes (C5 / CAT-02).
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const BASE = { reference: "croquettes-test-2kg", name: "Croquettes test", family: "CROQUETTES", description: "Recette test.\nSans céréales.", publicPriceCents: 1490, familyPriceCents: 1290,
  weightGrams: 2000, photos: [], purchasable: true, maxOrderQuantity: 5, shelf: "ALIMENTATION", subcategory: "croquettes", variantGroup: "croquettes-test", variantLabel: "2 kg",
  onRequest: false, isNew: false, availability: "in_stock", listed: true };
const product = (changes = {}) => publicProduct({ ...BASE, ...changes });
const CATALOGUE = { available: true, products: [
  product(),
  product({ reference: "croquettes-test-10kg", variantLabel: "10 kg", publicPriceCents: 4990, familyPriceCents: 4490, maxOrderQuantity: 0, availability: "out_of_stock" }),
  product({ reference: "laisse-test", name: "Laisse <cuir>", family: "COLIS", shelf: "SELLERIE", subcategory: "laisses", variantGroup: null, familyPriceCents: null, isNew: true, availability: "low_stock" }),
  product({ reference: "panier-osier", name: "Panier en osier", family: "COLIS", shelf: "ACCESSOIRES", subcategory: "couchages", variantGroup: null, onRequest: true, purchasable: false }),
  product({ reference: "masque", name: "Produit masqué", variantGroup: null, listed: false })
] };

function recorder() {
  return { statusCode: 200, headers: {}, body: "", setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; } };
}

test("une fiche par groupe de variantes, avec « À partir de », prix Famille et meilleure disponibilité", () => {
  const fiches = vitrine.buildFiches(CATALOGUE.products);
  assert.deepEqual(fiches.map((fiche) => fiche.slug), ["croquettes-test", "laisse-test", "panier-osier"], "le produit masqué n'est jamais présenté");
  const croquettes = fiches[0];
  assert.deepEqual(croquettes.variants.map((variant) => [variant.reference, variant.state]), [["croquettes-test-2kg", "in_stock"], ["croquettes-test-10kg", "out_of_stock"]]);
  assert.equal(croquettes.price, 1490); assert.equal(croquettes.priceFrom, true);
  assert.equal(croquettes.familyPrice, 1290); assert.equal(croquettes.familyPriceFrom, true);
  assert.equal(croquettes.state, "in_stock");
  assert.equal(fiches[2].state, "on_request");
  assert.equal(vitrine.findFiche(fiches, "croquettes-test-10kg"), croquettes, "l'URL d'une variante ouvre la fiche du groupe");
});

test("carte compacte : photo, nom, prix, prix Famille, disponibilité et seul bouton « Voir le produit »", () => {
  const [croquettes, laisse, panier] = vitrine.buildFiches(CATALOGUE.products);
  const card = vitrine.ficheCard(croquettes);
  assert.match(card, /À partir de 14,90/);
  assert.match(card, /Prix Famille Dynastie : À partir de 12,90/);
  assert.match(card, /En stock/);
  assert.equal((card.match(/class="btn-voir"/g) || []).length, 1);
  assert.match(card, /href="\/produits\/croquettes-test\/">Voir le produit<\/a>/);
  assert.doesNotMatch(card, /Ajouter au panier|<button|<form|Sans céréales|Retrait gratuit/, "ni achat, ni description, ni badge de retrait (C1–C3)");
  assert.match(vitrine.ficheCard(laisse), /Laisse &lt;cuir&gt;/);
  assert.match(vitrine.ficheCard(laisse), /Stock limité/);
  assert.doesNotMatch(vitrine.ficheCard(panier), /product-price/, "pas de prix affiché pour un article sur demande");
});

test("rayons : six URL stables, rayon vide sobre, parcours Animoco / Red Dingo et cosmétiques conservés", () => {
  assert.deepEqual(RAYONS.map((rayon) => rayon.slug), ["alimentation", "sellerie", "identification", "jouets", "accessoires", "hygiene-et-soins"]);
  const jouets = vitrine.renderRayon(CATALOGUE, "jouets");
  assert.match(jouets, /Produits prochainement disponibles\./);
  assert.match(jouets, /<link rel="canonical" href="https:\/\/boutique\.dynastiedorkhan\.com\/rayons\/jouets\/">/);
  const identification = vitrine.renderRayon(CATALOGUE, "identification");
  assert.match(identification, /href="\/medailles-connectees\/"/);
  assert.match(identification, /href="\/medailles-gravees\/"/);
  assert.match(identification, /19,99/); assert.match(identification, /16,95/);
  assert.doesNotMatch(vitrine.renderRayon(CATALOGUE, "hygiene-et-soins"), /href="\/cosmetiques\/"|Cosmétiques Artero/, "Artero retiré de la vente");
  assert.doesNotMatch(vitrine.renderRayon(CATALOGUE, "accessoires"), /Panier en osier/, "un article sur demande reste hors des rayons achetables");
  assert.equal(vitrine.renderRayon(CATALOGUE, "inconnu"), null);
  for (const rayon of RAYONS) assert.ok(vitrine.renderRayon({ available: true, products: [] }, rayon.slug).includes(SHOP_HEADER), rayon.slug);
});

test("accueil : scène interactive puis six accès classiques aux rayons, nouveautés masquées si vides, accès Sur demande", () => {
  const html = vitrine.renderAccueil(CATALOGUE);
  for (const rayon of RAYONS) assert.ok(html.includes(`class="rayon-tile`) && html.includes(`href="/rayons/${rayon.slug}/"`), rayon.slug);
  assert.match(html, /id="nouveautes"[\s\S]*Laisse &lt;cuir&gt;/);
  assert.match(html, /href="\/sur-demande\/"/);
  assert.match(html, /class="hero"/, "le bandeau photo actuel est conservé");
  assert.ok(html.indexOf('class="hero"') < html.indexOf("home-scene"), "la scène vient sous le visuel principal");
  assert.ok(html.indexOf("home-scene") < html.indexOf('id="rayons-title"'), "puis les accès classiques");
  assert.equal((html.match(/class="scene-zone /g) || []).length, 6);
  assert.doesNotMatch(vitrine.renderAccueil({ available: true, products: [product({ isNew: false })] }), /id="nouveautes"/);
  assert.match(vitrine.renderAccueil({ available: false, products: [] }), /Nos rayons/, "les rayons restent accessibles si le catalogue est indisponible");
});

test("scène interactive : zones cliquables en HTML, indépendantes de l'image, une par rayon", () => {
  const zones = Object.fromEntries(RAYONS.map((rayon, index) => [rayon.key, { left: index * 15, top: 50, width: 12, height: 30 }]));
  const html = vitrine.sceneHtml({ image: "/assets/scene.webp", width: 1600, height: 900, alt: "Deux chiots et six produits", zones });
  assert.equal((html.match(/class="scene-zone /g) || []).length, 6);
  for (const rayon of RAYONS) assert.match(html, new RegExp(`href="/rayons/${rayon.slug}/"[^>]*><span aria-hidden="true">${rayon.label}</span>`));
  assert.equal(vitrine.sceneHtml(null), "");
});

test("fiche : formats avec référence, prix et stock propres ; ajout au panier seulement sur la fiche ; retrait gratuit", () => {
  const html = vitrine.renderFiche(CATALOGUE, "croquettes-test");
  assert.match(html, /<h1>Croquettes test<\/h1>/);
  assert.match(html, /<input type="radio" name="variant" value="croquettes-test-2kg" checked>/);
  assert.match(html, /<input type="radio" name="variant" value="croquettes-test-10kg">/);
  assert.match(html, /data-fiche-add>Ajouter au panier<\/button>/);
  assert.match(html, /Retrait gratuit à l’élevage/);
  assert.match(html, /<link rel="canonical" href="https:\/\/boutique\.dynastiedorkhan\.com\/produits\/croquettes-test\/">/);
  const variants = JSON.parse(html.match(/<script type="application\/json" id="fiche-variants">(.*?)<\/script>/)[1]);
  assert.deepEqual(variants.map((variant) => [variant.reference, variant.price.replace(/\s/g, " "), variant.maxQuantity]), [["croquettes-test-2kg", "14,90 €", 5], ["croquettes-test-10kg", "49,90 €", 0]]);
  assert.match(vitrine.renderFiche(CATALOGUE, "croquettes-test-10kg"), /value="croquettes-test-10kg" checked/, "l'URL d'un format le présélectionne");
  const onRequest = vitrine.renderFiche(CATALOGUE, "panier-osier");
  assert.doesNotMatch(onRequest, /data-fiche-add|Ajouter au panier/);
  assert.match(onRequest, /non achetable directement en ligne/);
  assert.equal(vitrine.renderFiche(CATALOGUE, "masque"), null);
  assert.equal(vitrine.renderFiche(CATALOGUE, "../secret"), null);
  const injected = vitrine.renderFiche({ available: true, products: [product({ variantGroup: null, name: "</script><script>alert(1)</script>" })] }, "croquettes-test-2kg");
  assert.doesNotMatch(injected, /<\/script><script>alert/);
});

test("routes : réponses en cache court, 404 Boutique pour une page inconnue, 503 si le catalogue est indisponible", async () => {
  const ok = recorder();
  await handler({ method: "GET", query: { vue: "rayon", rayon: "sellerie" } }, ok, { listCatalogue: async () => CATALOGUE });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers["Cache-Control"], /s-maxage=60/);
  const missing = recorder();
  await handler({ method: "GET", query: { vue: "produit", fiche: "inconnu" } }, missing, { listCatalogue: async () => CATALOGUE });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /Retour à la Boutique/);
  const down = recorder();
  await handler({ method: "GET", query: { vue: "produit", fiche: "croquettes-test" } }, down, { listCatalogue: async () => ({ available: false, products: [] }) });
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers["Cache-Control"], "no-store");
});

test("gabarit commun : même en-tête sur toutes les pages Boutique, 404 statique à jour, titres H1 des pages juridiques", () => {
  for (const file of ["medailles-gravees/index.html", "medailles-connectees/index.html", "cosmetiques/index.html", "panier/index.html", "panier/confirmation/index.html",
    "conditions-generales-de-vente/index.html", "confidentialite/index.html", "mentions-legales/index.html", "renoncer-au-contrat/index.html", "404.html"]) {
    const html = read(file);
    assert.equal(html.split(SHOP_HEADER).length, 2, file);
    assert.doesNotMatch(html, /class="site-nav shop-nav"/, file);
    assert.match(html, /<a class="shop-return-link" href="https:\/\/www\.dynastiedorkhan\.com\/">← Retour au site de l’élevage<\/a>/, file);
    assert.match(html, /<h1[\s>]/, file);
  }
  assert.equal(read("404.html").replace(/\r\n/g, "\n"), vitrine.renderNotFound(), "404.html est régénérée depuis renderNotFound()");
  for (const archive of ["cgv-2026-10-05", "cgv-2026-10-07", "cgv-2026-10-21"]) {
    assert.equal(read(`conditions-generales-de-vente/${archive}/index.html`).includes(SHOP_HEADER), false, `${archive} reste telle que publiée`);
  }
});

test("scène validée : image recompressée en deux tailles, six zones sans chevauchement, libellés hors de l'image", () => {
  const scene = vitrine.SCENE;
  for (const [url, width] of scene.sources) {
    const file = path.join(root, url.slice(1));
    assert.ok(fs.existsSync(file), url);
    assert.ok(fs.statSync(file).size < (width > 1000 ? 220 : 80) * 1024, `${url} optimisée`);
  }
  assert.deepEqual(Object.keys(scene.zones).sort(), RAYONS.map((rayon) => rayon.key).sort());
  const boxes = Object.entries(scene.zones);
  for (const [key, zone] of boxes) {
    assert.ok(zone.left >= 0 && zone.top >= 0 && zone.left + zone.width <= 100 && zone.top + zone.height <= 100, key);
    for (const [other, box] of boxes) {
      if (other === key) continue;
      const overlap = Math.min(zone.left + zone.width, box.left + box.width) - Math.max(zone.left, box.left) > 0.5
        && Math.min(zone.top + zone.height, box.top + box.height) - Math.max(zone.top, box.top) > 0.5;
      assert.equal(overlap, false, `${key} / ${other}`);
    }
  }
  const html = vitrine.sceneHtml(scene);
  assert.ok(html.includes('srcset="/assets/accueil/scene-boutique-800.webp 800w, /assets/accueil/scene-boutique-1586.webp 1586w"'));
  assert.match(html, /width="1586" height="992"/);
  assert.match(html, /aria-label="Rayon Identification : la médaille"/);
});

test("sitemap Boutique : pages fixes puis fiches produit du catalogue, pages fixes seules si le catalogue est indisponible", async () => {
  const run = async (catalogue) => { const res = recorder(); await handler({ method: "GET", query: { vue: "sitemap" } }, res, { listCatalogue: async () => catalogue }); return res; };
  const ok = await run(CATALOGUE);
  assert.equal(ok.headers["Content-Type"], "application/xml; charset=utf-8");
  assert.match(ok.body, /<loc>https:\/\/boutique\.dynastiedorkhan\.com\/rayons\/alimentation\/<\/loc>/);
  for (const slug of ["croquettes-test", "laisse-test", "panier-osier"]) assert.match(ok.body, new RegExp(`<loc>https://boutique\.dynastiedorkhan\.com/produits/${slug}/</loc>`));
  assert.doesNotMatch(ok.body, /produits\/masque|croquettes-test-10kg/, "ni produit masqué, ni doublon de format");
  assert.equal((ok.body.match(/<\/urlset>/g) || []).length, 1);
  const down = await run({ available: false, products: [] });
  assert.doesNotMatch(down.body, /\/produits\//);
  assert.match(down.body, /<loc>https:\/\/boutique\.dynastiedorkhan\.com\/<\/loc>/);
});
