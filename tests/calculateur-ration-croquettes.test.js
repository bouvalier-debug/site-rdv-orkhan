const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicProduct } = require("../api/_orkhan-catalog");
const { RATION_CALCULATOR_URL, rationCalculatorHref, renderFiche } = require("../api/_vitrine");

const base = { family: "CROQUETTES", shelf: "ALIMENTATION", subcategory: "croquettes", publicPriceCents: 4990, familyPriceCents: 4490,
  purchasable: true, maxOrderQuantity: 5, availability: "in_stock", listed: true, onRequest: false, isNew: false, photos: [] };
const item = (changes) => publicProduct({ ...base, ...changes });
const variantsOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="fiche-variants">(.*?)<\/script>/s)[1]);
const linkOf = (html) => html.match(/<a class="btn-voir" href="([^"]*)" data-fiche-ration>Calculer la ration avec ces croquettes<\/a>/)?.[1].replace(/&amp;/g, "&");

test("lien vers le calculateur : énergie plausible en kcal/kg, sinon aucune valeur inventée", () => {
  assert.equal(rationCalculatorHref(3590), `${RATION_CALCULATOR_URL}?energie=3590&unite=kcal-kg`);
  for (const absent of [null, undefined, 0, 380, 2499, 5501, 3590.5, "3590"]) assert.equal(rationCalculatorHref(absent), RATION_CALCULATOR_URL);
  // La référence du format identifie la recette pour « Mon budget croquettes » ; elle ne remplace jamais l'énergie.
  assert.equal(rationCalculatorHref(3590, "wc-puppy-1"), `${RATION_CALCULATOR_URL}?energie=3590&unite=kcal-kg&format=wc-puppy-1`);
  assert.equal(rationCalculatorHref(null, "ol-mini-2"), `${RATION_CALCULATOR_URL}?format=ol-mini-2`);
});

test("fiche croquettes avec énergie : lien prérempli, aucune mention de saisie manuelle", () => {
  const catalogue = { available: true, products: [
    item({ reference: "wc-puppy-1", name: "Wellness CORE Puppy", variantGroup: "wc-puppy", variantLabel: "1,5 kg", weightGrams: 1500, energyKcalPerKg: 3590 }),
    item({ reference: "wc-puppy-10", name: "Wellness CORE Puppy", variantGroup: "wc-puppy", variantLabel: "10 kg", weightGrams: 10000, publicPriceCents: 8990, energyKcalPerKg: 3590 })
  ] };
  const html = renderFiche(catalogue, "wc-puppy");
  assert.equal(linkOf(html), "https://www.dynastiedorkhan.com/outils/calculateur-ration/?energie=3590&unite=kcal-kg&format=wc-puppy-1");
  assert.match(html, /<p data-fiche-ration-manual hidden>/);
  // Chaque format transmet l'énergie de la recette (kcal/kg), jamais le poids du sac.
  assert.deepEqual(variantsOf(html).map((variant) => [variant.label, variant.rationHref, variant.rationEnergy]), [
    ["1,5 kg", `${RATION_CALCULATOR_URL}?energie=3590&unite=kcal-kg&format=wc-puppy-1`, 3590],
    ["10 kg", `${RATION_CALCULATOR_URL}?energie=3590&unite=kcal-kg&format=wc-puppy-10`, 3590]
  ]);
  assert.doesNotMatch(html, /energie=(1500|10000)/);
});

test("fiche croquettes sans énergie : calculateur ouvert sans préremplissage et saisie manuelle annoncée", () => {
  const catalogue = { available: true, products: [
    item({ reference: "ol-mini-2", name: "Opti Life Mini Adult", variantGroup: "ol-mini", variantLabel: "2,5 kg", weightGrams: 2500 }),
    item({ reference: "ol-mini-7", name: "Opti Life Mini Adult", variantGroup: "ol-mini", variantLabel: "7,5 kg", weightGrams: 7500, energyKcalPerKg: 380 })
  ] };
  const html = renderFiche(catalogue, "ol-mini");
  assert.equal(linkOf(html), `${RATION_CALCULATOR_URL}?format=ol-mini-2`);
  assert.match(html, /<p data-fiche-ration-manual>L’énergie de cette recette n’est pas encore renseignée/);
  assert.deepEqual(variantsOf(html).map((variant) => variant.rationEnergy), [null, null]);
});

test("chaque format garde sa propre énergie : rien n'est déduit d'un autre format", () => {
  const catalogue = { available: true, products: [
    item({ reference: "r-2", name: "Recette", variantGroup: "r", variantLabel: "2 kg", weightGrams: 2000, energyKcalPerKg: 3700, displayOrder: 1 }),
    item({ reference: "r-12", name: "Recette", variantGroup: "r", variantLabel: "12 kg", weightGrams: 12000, displayOrder: 2 })
  ] };
  assert.deepEqual(variantsOf(renderFiche(catalogue, "r")).map((variant) => variant.rationHref), [`${RATION_CALCULATOR_URL}?energie=3700&unite=kcal-kg&format=r-2`, `${RATION_CALCULATOR_URL}?format=r-12`]);
  assert.equal(linkOf(renderFiche(catalogue, "r-12")), `${RATION_CALCULATOR_URL}?format=r-12`);
});

test("aucun lien de ration hors croquettes", () => {
  const catalogue = { available: true, products: [item({ reference: "friandise", name: "Friandise", subcategory: "friandises", energyKcalPerKg: 3500 })] };
  const html = renderFiche(catalogue, "friandise");
  assert.doesNotMatch(html, /data-fiche-ration|data-fiche-budget|Calculer la ration|budget croquettes/);
  assert.equal(variantsOf(html)[0].rationHref, undefined);
});

test("le script de la fiche met à jour le lien au changement de format", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/vitrine.js"), "utf8");
  assert.match(source, /rationLink\.href = variant\.rationHref/);
  assert.match(source, /rationManual\.hidden = Boolean\(variant\.rationEnergy\)/);
});
