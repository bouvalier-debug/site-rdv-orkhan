const test = require("node:test");
const assert = require("node:assert/strict");
const { publicProduct } = require("../api/_orkhan-catalog");
const { buildFiches, renderFiche } = require("../api/_vitrine");

const photoId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const photo = (number, altText) => ({ url: `/api/shop-catalog/photos/${photoId(number)}`, width: 1200, height: 1200, altText, main: true });
const base = {
  name: "Collier cuir", family: "COLIS", shelf: "SELLERIE", subcategory: "colliers",
  variantGroup: "collier-cuir", publicPriceCents: 2490, familyPriceCents: 2190,
  weightGrams: 200, purchasable: true, maxOrderQuantity: 5, availability: "in_stock",
  listed: true, onRequest: false, isNew: false, photos: []
};
const product = (changes) => publicProduct({ ...base, ...changes });
const products = [
  product({ reference: "collier-bleu-m", variantLabel: "Bleu · M", variantOptions: [{ axis: "Couleur", value: "Bleu" }, { axis: "Taille", value: "M" }], displayOrder: 30, publicPriceCents: 2690, familyPriceCents: null, photos: [photo(3, "Collier bleu"), photo(4, "Collier bleu de côté")] }),
  product({ reference: "collier-rouge-s", variantLabel: "Rouge · S", variantOptions: [{ axis: "Couleur", value: "Rouge" }, { axis: "Taille", value: "S" }], displayOrder: 10, photos: [photo(1, "Collier rouge"), photo(2, "Collier rouge de côté")] }),
  product({ reference: "collier-rouge-m", variantLabel: "Rouge · M", variantOptions: [{ axis: "Couleur", value: "Rouge" }, { axis: "Taille", value: "M" }], displayOrder: 20, maxOrderQuantity: 0, availability: "out_of_stock" })
];
const catalogue = { available: true, products };
const variantData = (html) => JSON.parse(html.match(/<script type="application\/json" id="fiche-variants">(.*?)<\/script>/)[1]);

test("le contrat conserve les libellés et l'ordre du Manager, avec des photos propres à chaque variante", () => {
  const [fiche] = buildFiches(products);
  assert.deepEqual(fiche.variants.map((variant) => variant.reference), ["collier-rouge-s", "collier-rouge-m", "collier-bleu-m"]);
  assert.equal(fiche.slug, "collier-cuir");
  const withClosedVariant = [...products, product({ reference: "collier-ferme", listed: false,
    variantOptions: [{ axis: "Couleur", value: "Vert" }, { axis: "Taille", value: "L" }] })];
  assert.equal(buildFiches(withClosedVariant).length, 1);
  assert.deepEqual(variantData(renderFiche({ available: true, products: withClosedVariant }, "collier-cuir"))
    .map((variant) => variant.reference), ["collier-rouge-s", "collier-rouge-m", "collier-bleu-m"]);
  assert.deepEqual(products[0].variantOptions, [{ axis: "Couleur", value: "Bleu" }, { axis: "Taille", value: "M" }]);
  assert.deepEqual(products[0].photos.map((item) => item.altText), ["Collier bleu", "Collier bleu de côté"]);
  assert.equal(product({ reference: "simple", variantGroup: null, variantOptions: [{ axis: "Couleur", value: "Rouge" }] }).variantOptions, null);
});

test("la fiche regroupe le modèle, sépare les axes et grise les combinaisons absentes", () => {
  const html = renderFiche(catalogue, "collier-bleu-m");
  assert.match(html, /<h1>Collier cuir<\/h1>/);
  assert.match(html, /data-variant-axis="0"><legend>Couleur<\/legend>/);
  assert.match(html, /data-variant-axis="1"><legend>Taille<\/legend>/);
  assert.match(html, /name="variant-axis-0" value="Rouge"/);
  assert.match(html, /name="variant-axis-0" value="Bleu" checked/);
  assert.match(html, /name="variant-axis-1" value="S" disabled/);
  assert.match(html, /name="variant-axis-1" value="M" checked/);
  assert.match(html, /data-fiche-price>26,90/);
  assert.match(html, /data-fiche-family hidden/);
  assert.match(html, /data-fiche-ref>collier-bleu-m/);
  assert.match(html, new RegExp(`data-fiche-photo[^>]*${photoId(3)}`));
  const variants = variantData(html);
  assert.deepEqual(variants.map((variant) => variant.reference), ["collier-rouge-s", "collier-rouge-m", "collier-bleu-m"]);
  assert.deepEqual(variants[2].photos.map((item) => item.altText), ["Collier bleu", "Collier bleu de côté"]);
  assert.deepEqual(variants[1].photos.map((item) => item.altText), ["Collier rouge", "Collier rouge de côté"], "une variante sans photo reprend la galerie du groupe");
  assert.equal(variants[1].maxQuantity, 0, "une variante publiée sans stock reste visible mais non achetable");
});

test("formats historiques, produits simples et liste de plus de dix variantes restent pris en charge", () => {
  const formats = [
    product({ reference: "croquettes-2kg", name: "Croquettes", family: "CROQUETTES", variantGroup: "croquettes", variantLabel: "2 kg", variantOptions: null }),
    product({ reference: "croquettes-10kg", name: "Croquettes", family: "CROQUETTES", variantGroup: "croquettes", variantLabel: "10 kg", variantOptions: null })
  ];
  assert.match(renderFiche({ available: true, products: formats }, "croquettes"), /<legend>Format<\/legend>/);
  const mixed = [...formats, product({ reference: "croquettes-rouge", name: "Croquettes", family: "CROQUETTES",
    variantGroup: "croquettes", variantLabel: "Rouge", variantOptions: [{ axis: "Couleur", value: "Rouge" }] })];
  assert.match(renderFiche({ available: true, products: mixed }, "croquettes"), /<legend>Format<\/legend>/);
  const simple = product({ reference: "laisse-simple", name: "Laisse simple", variantGroup: null, variantOptions: null });
  const simpleHtml = renderFiche({ available: true, products: [simple] }, "laisse-simple");
  assert.doesNotMatch(simpleHtml, /class="fiche-variants"|data-variant-axes/);
  assert.match(simpleHtml, /data-fiche-add>Ajouter au panier/);
  const many = Array.from({ length: 12 }, (_, index) => product({
    reference: `collier-taille-${index + 1}`, variantLabel: `Taille ${index + 1}`,
    variantOptions: [{ axis: "Taille", value: String(index + 1) }], displayOrder: index
  }));
  assert.equal(variantData(renderFiche({ available: true, products: many }, "collier-cuir")).length, 12);
});
