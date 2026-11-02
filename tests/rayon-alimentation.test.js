const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicBrandCard, publicProduct } = require("../api/_orkhan-catalog");
const { renderAlimentation, renderRayon } = require("../api/_vitrine");
const handler = require("../api/vitrine");
const { applicablePrice, sortItems } = require("../assets/product-sort.js");

const photo = (id) => ({ url: `/api/shop-catalog/photos/00000000-0000-4000-9000-00000000000${id}`, width: 10, height: 10, altText: "Sac" });
const base = { family: "CROQUETTES", shelf: "ALIMENTATION", subcategory: "croquettes", publicPriceCents: 4000, familyPriceCents: 3500, purchasable: true, maxOrderQuantity: 5, availability: "in_stock", listed: true, onRequest: false, isNew: false };
const item = (changes) => publicProduct({ ...base, ...changes });
const products = [
  item({ reference: "ac-adult", name: "Acana Adult", variantGroup: "ac-adult", variantLabel: "12 kg", brand: "Acana", lifeStages: ["adult"], photos: [photo(1)] }),
  item({ reference: "or-puppy", name: "Orijen Puppy", variantGroup: "or-puppy", variantLabel: "12 kg", publicPriceCents: 9000, brand: "Orijen", lifeStages: ["puppy"], photos: [photo(2)] }),
  item({ reference: "ac-treat", name: "Acana Biscuits", family: "COLIS", subcategory: "friandises", brand: "Acana", publicPriceCents: 900, familyPriceCents: null, photos: [photo(3)] }),
  item({ reference: "ol-treat", name: "Opti Life Os", family: "COLIS", subcategory: "friandises", brand: "Opti Life", publicPriceCents: 700, familyPriceCents: null }),
  item({ reference: "pat-1", name: "Pâtée bœuf", family: "COLIS", subcategory: "patees", brand: "Acana" })
];
const cards = [
  { slug: "orijen", name: "Orijen", brand: "ORIJEN", croquettes: true, friandises: false, displayOrder: 10, photo: null },
  { slug: "acana", name: "Acana", brand: "Acana", croquettes: true, friandises: true, displayOrder: 20, photo: { url: "/api/catalogue-photo?id=00000000-0000-4000-9000-000000000009", width: 5, height: 5, altText: "Visuel choisi" } }
];

test("page Alimentation : deux rubriques distinctes, cartes par marque dans l'ordre du Manager, croquettes et friandises non mélangées", () => {
  const html = renderRayon({ available: true, products, brandCards: cards }, "alimentation");
  const croquettes = html.slice(html.indexOf('id="rubrique-croquettes"'), html.indexOf('id="rubrique-friandises"'));
  const friandises = html.slice(html.indexOf('id="rubrique-friandises"'));
  assert.deepEqual([...croquettes.matchAll(/href="\/rayons\/alimentation\/croquettes\/([a-z-]+)\/"/g)].map((m) => m[1]), ["orijen", "acana"]);
  assert.deepEqual([...friandises.matchAll(/href="\/rayons\/alimentation\/friandises\/([a-z-]+)\/"/g)].map((m) => m[1]), ["acana"], "Orijen n'a pas de friandise ; Opti Life n'a pas de carte");
  assert.match(croquettes, /href="\/rayons\/alimentation\/croquettes\/">Toutes les croquettes \(2\)/);
  assert.match(friandises, /href="\/rayons\/alimentation\/friandises\/">Toutes les friandises \(2\)/);
  assert.match(html, /src="\/api\/catalogue-photo\?id=00000000-0000-4000-9000-000000000009"/, "le visuel choisi dans le Manager prime");
  assert.match(html, /src="\/api\/catalogue-photo\?id=00000000-0000-4000-9000-000000000002"/, "sinon la photo d'un produit de la marque");
  assert.match(html, /Autres articles/);
  assert.match(html, /Pâtée bœuf/, "les autres sous-catégories restent accessibles");
});

test("une carte masquée (absente de la liste du Manager) disparaît, ses produits restent dans « Toutes les croquettes »", () => {
  const catalogue = { available: true, products, brandCards: [cards[0]] };
  const html = renderRayon(catalogue, "alimentation");
  assert.doesNotMatch(html, /croquettes\/acana\//);
  assert.equal(renderAlimentation(catalogue, "croquettes", "acana"), null);
  assert.match(renderAlimentation(catalogue, "croquettes"), /Acana Adult/);
});

test("sans cartes du Manager, une carte automatique par marque est déduite du catalogue", () => {
  const html = renderRayon({ available: true, products, brandCards: null }, "alimentation");
  for (const slug of ["acana", "opti-life", "orijen"]) assert.match(html, new RegExp(`/rayons/alimentation/(croquettes|friandises)/${slug}/`));
});

test("page d'une marque : uniquement les produits de la marque dans la rubrique, filtres et tri conservés", () => {
  const catalogue = { available: true, products, brandCards: cards };
  const croquettes = renderAlimentation(catalogue, "croquettes", "acana");
  assert.match(croquettes, /Acana Adult/);
  assert.doesNotMatch(croquettes, /Orijen Puppy|Acana Biscuits/);
  assert.match(croquettes, /<link rel="canonical" href="https:\/\/boutique\.dynastiedorkhan\.com\/rayons\/alimentation\/croquettes\/acana\/">/);
  const friandises = renderAlimentation(catalogue, "friandises", "acana");
  assert.match(friandises, /Acana Biscuits/);
  assert.doesNotMatch(friandises, /Acana Adult|Opti Life Os/);
  const all = renderAlimentation(catalogue, "friandises");
  assert.match(all, /Acana Biscuits/);
  assert.match(all, /Opti Life Os/, "toutes les friandises, même sans carte de marque");
  assert.match(all, /data-sort-bar/);
  assert.match(all, /product-sort\.js/);
  assert.doesNotMatch(all, /data-recipe-filters/, "les filtres de profil ne concernent que les croquettes");
  assert.match(renderAlimentation(catalogue, "croquettes"), /data-recipe-filters/);
  assert.match(renderAlimentation(catalogue, "croquettes"), /name="brand"/);
  assert.doesNotMatch(croquettes, /name="brand"/, "pas de filtre Marque sur la page d'une marque");
  assert.equal(renderAlimentation(catalogue, "patees"), null);
  assert.equal(renderAlimentation(catalogue, "croquettes", "inconnue"), null);
});

test("le menu Trier par propose les six options et chaque carte porte ses prix", () => {
  const html = renderAlimentation({ available: true, products, brandCards: cards }, "croquettes");
  for (const value of ["defaut", "prix-asc", "prix-desc", "recents", "nom-asc", "nom-desc"]) assert.match(html, new RegExp(`<option value="${value}">`));
  assert.match(html, /data-order="0" data-name="Acana Adult" data-price="4000" data-family-price="3500"/);
});

test("tri : prix applicable (public ou Famille), récents, noms ; ordre par défaut = ordre du Manager", () => {
  const items = [
    { name: "Bravo", price: "5000", familyPrice: "3000", published: "2026-10-01T00:00:00.000Z", order: "0" },
    { name: "alpha", price: "4000", familyPrice: "", published: "2026-10-20T00:00:00.000Z", order: "1" },
    { name: "Zèbre", price: "4500", published: "", order: "2" }
  ];
  const names = (mode, family) => sortItems(items, mode, family).map((entry) => entry.name);
  assert.deepEqual(names("defaut", false), ["Bravo", "alpha", "Zèbre"]);
  assert.deepEqual(names("prix-asc", false), ["alpha", "Zèbre", "Bravo"]);
  assert.deepEqual(names("prix-desc", false), ["Bravo", "Zèbre", "alpha"]);
  assert.deepEqual(names("prix-asc", true), ["Bravo", "alpha", "Zèbre"], "prix Famille 30 € pour Bravo, public pour les autres");
  assert.deepEqual(names("recents", false), ["alpha", "Bravo", "Zèbre"]);
  assert.deepEqual(names("nom-asc", false), ["alpha", "Bravo", "Zèbre"]);
  assert.deepEqual(names("nom-desc", false), ["Zèbre", "Bravo", "alpha"]);
  assert.equal(applicablePrice(items[1], true), 4000, "sans prix Famille, le prix public s'applique");
  assert.equal(items.length, 3, "le tri ne retire aucune carte");
});

test("lecture des cartes du Manager : liste blanche, photo via la route de la Boutique, valeurs invalides ignorées", () => {
  const card = publicBrandCard({ slug: "acana", name: "Acana", brand: "Acana", croquettes: true, friandises: "oui", displayOrder: 3, photo: { url: "https://evil.test/x", width: 1, height: 1 }, secret: "x" });
  assert.deepEqual(card, { slug: "acana", name: "Acana", brand: "Acana", croquettes: true, friandises: false, displayOrder: 3, photo: null });
  assert.equal(publicBrandCard({ slug: "../x", name: "X", brand: "X" }), null);
  const withPhoto = publicBrandCard({ slug: "a", name: "A", brand: "A", photo: { url: "/api/shop-catalog/photos/00000000-0000-4000-9000-000000000009", width: 4, height: 4, altText: "Alt" } });
  assert.equal(withPhoto.photo.url, "/api/catalogue-photo?id=00000000-0000-4000-9000-000000000009");
});

test("routes : les pages rubrique et marque passent par l'unique fonction vitrine, avant la route générique des rayons", async () => {
  const rewrites = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8")).rewrites;
  const index = (source) => rewrites.findIndex((rule) => rule.source === source);
  assert.ok(index("/rayons/alimentation/:rubrique/:marque/") > -1 && index("/rayons/alimentation/:rubrique/:marque/") < index("/rayons/:rayon/"));
  assert.equal(rewrites[index("/rayons/alimentation/:rubrique/:marque")].destination, "/api/vitrine?vue=alimentation&rubrique=:rubrique&marque=:marque");
  const recorder = () => ({ headers: {}, status(code) { this.code = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, send(body) { this.body = body; return this; } });
  const run = async (query) => { const res = recorder(); await handler({ method: "GET", query: { vue: "alimentation", ...query } }, res, { listCatalogue: async () => ({ available: true, products, brandCards: cards }) }); return res; };
  assert.equal((await run({ rubrique: "croquettes", marque: "orijen" })).code, 200);
  assert.equal((await run({ rubrique: "croquettes", marque: "absente" })).code, 404);
  assert.equal((await run({ rubrique: "croquettes" })).code, 200);
});

test("tri Famille : le point d'entrée accepte une puce ou un code Famille, jamais les deux, et la Boutique envoie la preuve mémorisée au panier", async () => {
  const eligibility = require("../api/family-eligibility");
  const responder = () => ({ headers: {}, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
  const calls = [];
  const original = global.fetch;
  process.env.ORKHAN_MANAGER_URL = "https://manager.preview.test";
  process.env.ORKHAN_FAMILY_API_SECRET = "s";
  global.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => ({ recognized: true }) }; };
  try {
    const code = responder();
    await eligibility({ method: "POST", headers: { "x-forwarded-for": "9.9.9.1" }, body: { familyCode: "DYN-ABCD-2345" } }, code);
    const chip = responder();
    await eligibility({ method: "POST", headers: { "x-forwarded-for": "9.9.9.2" }, body: { chipNumber: "250123456789012" } }, chip);
    assert.equal(code.statusCode, 200);
    assert.deepEqual([code.body, chip.body], [{ recognized: true }, { recognized: true }]);
    assert.ok(calls.some((url) => url.endsWith("/verify-code")) && calls.some((url) => url.endsWith("/verify-chip")), calls.join(","));
  } finally { global.fetch = original; }
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "product-sort.js"), "utf8");
  assert.match(script, /\/\[a-z\]\/i\.test\(proof\) \? \{ familyCode: proof \} : \{ chipNumber: proof \}/);
});
