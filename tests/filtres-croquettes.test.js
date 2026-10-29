const test = require("node:test");
const assert = require("node:assert/strict");
const { publicProduct } = require("../api/_orkhan-catalog");
const { buildFiches, renderRayon } = require("../api/_vitrine");
const { matches } = require("../assets/recipe-filters.js");

const base = { family: "CROQUETTES", shelf: "ALIMENTATION", subcategory: "croquettes", publicPriceCents: 4990, familyPriceCents: 4490,
  purchasable: false, maxOrderQuantity: 0, availability: "out_of_stock", listed: true, onRequest: false, isNew: false, photos: [] };
const item = (changes) => publicProduct({ ...base, ...changes });
const products = [
  item({ reference: "ol-puppy-3", name: "Opti Life Puppy", variantGroup: "ol-puppy", variantLabel: "3 kg", brand: "Opti Life", lifeStages: ["puppy"], traits: [], dogSize: "medium", energyKcalPerKg: 3900 }),
  item({ reference: "ol-puppy-12", name: "Opti Life Puppy", variantGroup: "ol-puppy", variantLabel: "12 kg", publicPriceCents: 9990, brand: "Opti Life", lifeStages: ["puppy"], traits: [], dogSize: "medium", energyKcalPerKg: 3900 }),
  item({ reference: "ol-active", name: "Opti Life Active", variantGroup: "ol-active", variantLabel: "12 kg", brand: "Opti Life", lifeStages: ["adult"], traits: ["active"] }),
  item({ reference: "pr-light", name: "Primordial Light", variantGroup: "pr-light", variantLabel: "12 kg", brand: "Primordial", lifeStages: ["adult", "senior"], traits: ["light", "sterilised"] }),
  item({ reference: "wl-vide", name: "Wellness non classée", variantGroup: "wl-vide", variantLabel: "12 kg" })
];

test("le contrat public lit le profil et ignore les valeurs invalides", () => {
  const [puppy] = products;
  assert.deepEqual([puppy.brand, puppy.lifeStages, puppy.traits, puppy.dogSize, puppy.energyKcalPerKg], ["Opti Life", ["puppy"], [], "medium", 3900]);
  const bad = item({ reference: "x", name: "X", lifeStages: ["kitten", "adult"], traits: "active", dogSize: "xl", energyKcalPerKg: 380 });
  assert.deepEqual([bad.lifeStages, bad.traits, bad.dogSize, bad.energyKcalPerKg], [["adult"], [], null, null]);
  const empty = item({ reference: "y", name: "Y" });
  assert.deepEqual([empty.brand, empty.lifeStages, empty.energyKcalPerKg], [null, [], null]);
});

test("une fiche regroupe ses formats et garde un seul profil", () => {
  const fiches = buildFiches(products);
  assert.equal(fiches.length, 4);
  const puppy = fiches.find((fiche) => fiche.slug === "ol-puppy");
  assert.equal(puppy.variants.length, 2);
  assert.equal(puppy.recipe.brand, "Opti Life");
  assert.equal(fiches.find((fiche) => fiche.slug === "wl-vide").recipe.brand, null);
});

test("le rayon rend les filtres Marque et Profil et marque chaque carte", () => {
  const html = renderRayon({ available: true, products }, "alimentation");
  assert.match(html, /data-recipe-filters/);
  assert.match(html, /<option value="Opti Life">/);
  assert.match(html, /<option value="Primordial">/);
  for (const token of ["puppy", "adult", "diet", "senior", "active"]) assert.match(html, new RegExp(`name="profile" value="${token}"`));
  assert.match(html, /data-brand="Primordial" data-profile="adult senior diet"/);
  assert.match(html, /\/assets\/recipe-filters\.js/);
  // La fiche non renseignée n'a aucune donnée de filtre mais reste présente.
  assert.match(html, /<article class="product-tile"><a[^>]*>.*?Wellness non classée/s);
});

test("aucun filtre n'apparaît sans profil renseigné, ni hors des croquettes", () => {
  const plain = [item({ reference: "wl", name: "Wellness", variantGroup: "wl", variantLabel: "12 kg" })];
  const html = renderRayon({ available: true, products: plain }, "alimentation");
  assert.doesNotMatch(html, /data-recipe-filters/);
  assert.doesNotMatch(html, /recipe-filters\.js/);
  assert.doesNotMatch(renderRayon({ available: true, products }, "jouets"), /data-recipe-filters/);
});

test("un nom de marque est échappé dans la page", () => {
  const html = renderRayon({ available: true, products: [item({ reference: "z", name: "Z", variantGroup: "z", variantLabel: "1", brand: 'A"><script>1</script>', lifeStages: ["adult"] })] }, "alimentation");
  assert.doesNotMatch(html, /<script>1<\/script>/);
});

test("la logique de filtre : Tous, marque, profils cumulables, produits non renseignés", () => {
  const tiles = { puppy: { brand: "Opti Life", profile: "puppy" }, active: { brand: "Opti Life", profile: "adult active" }, light: { brand: "Primordial", profile: "adult senior diet" }, vide: {} };
  const keep = (brand, profiles) => Object.entries(tiles).filter(([, tile]) => matches(tile, brand, profiles)).map(([key]) => key);
  assert.deepEqual(keep("", []), ["puppy", "active", "light", "vide"]);
  assert.deepEqual(keep("Opti Life", []), ["puppy", "active"]);
  assert.deepEqual(keep("", ["adult"]), ["active", "light"]);
  assert.deepEqual(keep("", ["adult", "active"]), ["active"]);
  assert.deepEqual(keep("Primordial", ["diet", "senior"]), ["light"]);
  assert.deepEqual(keep("Opti Life", ["diet"]), []);
});
