const test = require("node:test");
const assert = require("node:assert/strict");
const { publicProduct } = require("../api/_orkhan-catalog");
const vitrine = require("../api/_vitrine");
const { RAYONS } = require("../scripts/shop-layout");

// Sous-catégorie « Outils de toilettage » du rayon Hygiène et soins : brosses, peignes et cardes regroupés à part,
// sans modifier le classement des shampooings, soins et articles d'entretien.
const BASE = { family: "COLIS", description: null, publicPriceCents: 600, familyPriceCents: 570, weightGrams: null, photos: [], purchasable: true,
  maxOrderQuantity: 3, shelf: "HYGIENE_SOINS", variantGroup: null, variantLabel: null, onRequest: false, isNew: false, availability: "in_stock", listed: true };
const product = (changes) => publicProduct({ ...BASE, ...changes });
const CATALOGUE = { available: true, products: [
  product({ reference: "idealdog-brosse-pneumatique-picots-perles-m", name: "Brosse pneumatique à picots perlés IdealDog — Taille M", subcategory: "outils-de-toilettage" }),
  product({ reference: "idealdog-peigne-medium-36-dents", name: "Peigne médium IdealDog — 36 dents", subcategory: "outils-de-toilettage" }),
  product({ reference: "idealdog-carde-ergonomique-picots-souples-s", name: "Carde ergonomique IdealDog à picots souples — Taille S", subcategory: "outils-de-toilettage" }),
  product({ reference: "shampooing-test", name: "Shampooing test", subcategory: "shampooings" }),
  product({ reference: "gel-yeux-test", name: "Gel yeux test", subcategory: "entretien" })
] };

test("le rayon Hygiène et soins déclare la sous-catégorie Outils de toilettage sans renommer Entretien", () => {
  const hygiene = RAYONS.find((rayon) => rayon.key === "HYGIENE_SOINS");
  assert.deepEqual(hygiene.subcategories, { shampooings: "Shampooings", entretien: "Entretien", soins: "Soins", "outils-de-toilettage": "Outils de toilettage" });
});

test("les trois outils IdealDog sont regroupés sous « Outils de toilettage », les autres produits gardent leur section", () => {
  const html = vitrine.renderRayon(CATALOGUE, "hygiene-et-soins");
  const section = (title) => {
    const start = html.indexOf(`<h2 class="subcategory-title">${title}</h2>`);
    assert.ok(start >= 0, `section ${title} absente`);
    const next = html.indexOf('<h2 class="subcategory-title">', start + 1);
    return html.slice(start, next < 0 ? undefined : next);
  };
  const outils = section("Outils de toilettage");
  for (const name of ["Brosse pneumatique à picots perlés IdealDog", "Peigne médium IdealDog", "Carde ergonomique IdealDog à picots souples"]) assert.ok(outils.includes(name), name);
  assert.ok(!outils.includes("Shampooing test") && !outils.includes("Gel yeux test"));
  assert.ok(section("Shampooings").includes("Shampooing test"));
  assert.ok(section("Entretien").includes("Gel yeux test"));
  assert.doesNotMatch(html, /Autres articles/, "aucun produit ne tombe dans la section de repli");
});
