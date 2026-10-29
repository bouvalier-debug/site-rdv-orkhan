const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicProduct } = require("../api/_orkhan-catalog");
const { renderFiche } = require("../api/_vitrine");
const { budgetRecipes, renderBudget } = require("../api/_budget-croquettes");
const handler = require("../api/vitrine");
const budget = require("../assets/budget-croquettes.js");

const base = { family: "CROQUETTES", shelf: "ALIMENTATION", subcategory: "croquettes", purchasable: true, maxOrderQuantity: 5,
  availability: "in_stock", listed: true, onRequest: false, isNew: false, photos: [] };
const item = (changes) => publicProduct({ ...base, ...changes });
const catalogue = { available: true, products: [
  item({ reference: "wc-1-5", name: "Wellness CORE Puppy", variantGroup: "wc", variantLabel: "1,5 kg", weightGrams: 1500, publicPriceCents: 1490, familyPriceCents: 1290, energyKcalPerKg: 3590 }),
  item({ reference: "wc-10", name: "Wellness CORE Puppy", variantGroup: "wc", variantLabel: "10 kg", weightGrams: 10000, publicPriceCents: 5990, familyPriceCents: 5690, energyKcalPerKg: 3590,
    purchasable: false, maxOrderQuantity: 0, availability: "out_of_stock" }),
  item({ reference: "pr-12", name: "Primordial Adulte", brand: "Primordial", weightGrams: null, publicPriceCents: 6564, familyPriceCents: 6236 }),
  item({ reference: "sur-commande", name: "Recette sur commande", onRequest: true, weightGrams: 12000, publicPriceCents: 7000 }),
  item({ reference: "friandise", name: "Friandise", subcategory: "friandises", weightGrams: 500, publicPriceCents: 590 })
] };

test("exemple de référence : sac de 10 kg à 59,90 €, 150 g/jour", () => {
  const result = budget.bagBudget({ rationGrams: 150, bagGrams: 10000, publicPriceCents: 5990, familyPriceCents: null });
  assert.equal(result.status, "ok");
  assert.equal(budget.daysText(result.days), "environ 67 jours");
  assert.equal(budget.euros(result.public.dailyCents), "0,90 €");
  assert.equal(budget.euros(result.public.periodCents), "26,96 €");
  assert.equal(budget.kilograms(result.periodGrams), "4,5 kg");
  // Coût de consommation au prorata ≠ dépense d'achat de sacs entiers.
  assert.equal(result.bags, 1);
  assert.equal(budget.euros(result.public.purchaseCents), "59,90 €");
  assert.equal(result.family, null);
});

test("prix Famille : le prix enregistré est utilisé tel quel, sans remise supplémentaire", () => {
  const result = budget.bagBudget({ rationGrams: 150, bagGrams: 10000, publicPriceCents: 5990, familyPriceCents: 5690 });
  assert.equal(result.family.periodCents, 5690 * 4500 / 10000);
  assert.equal(budget.euros(result.family.periodCents), "25,61 €");
  assert.equal(result.family.purchaseCents, 5690);
  assert.notEqual(result.family.periodCents, result.public.periodCents * 0.95);
});

test("sacs entiers sur 30 jours : arrondi supérieur, sans exiger un sac de trop sur un multiple exact", () => {
  assert.equal(budget.bagBudget({ rationGrams: 250, bagGrams: 7500, publicPriceCents: 3788 }).bags, 1);
  assert.equal(budget.bagBudget({ rationGrams: 251, bagGrams: 7500, publicPriceCents: 3788 }).bags, 2);
  assert.equal(budget.bagBudget({ rationGrams: 300, bagGrams: 1500, publicPriceCents: 1490 }).bags, 6);
  // Aucun arrondi intermédiaire : 0,1 € près sur 30 jours reste exact.
  assert.equal(budget.bagBudget({ rationGrams: 97, bagGrams: 2500, publicPriceCents: 1472 }).public.periodCents, 1472 * 2910 / 2500);
});

test("ration absente ou invalide, poids ou prix manquant : aucun calcul", () => {
  for (const ration of [0, -10, NaN, 3001, budget.parseAmount(""), budget.parseAmount("abc")]) {
    assert.equal(budget.bagBudget({ rationGrams: ration, bagGrams: 10000, publicPriceCents: 5990 }).status, "invalid-ration");
  }
  assert.equal(budget.bagBudget({ rationGrams: 150, bagGrams: null, publicPriceCents: 5990 }).status, "missing-bag-weight");
  assert.equal(budget.bagBudget({ rationGrams: 150, bagGrams: 10000, publicPriceCents: null }).status, "missing-price");
  assert.equal(budget.parseAmount("1,5"), 1.5);
  assert.equal(budget.parseAmount(" 150 "), 150);
});

test("sac en cours : 1,5 kg restant, 150 g/jour, délai 3 jours et marge 2 jours", () => {
  const today = new Date(2026, 9, 29, 15, 30);
  const plan = budget.remainingPlan({ rationGrams: 150, remainingGrams: 1500, leadDays: 3, marginDays: 2, today });
  assert.equal(plan.status, "ok");
  assert.equal(plan.days, 10);
  assert.equal(plan.anticipation, 5);
  assert.deepEqual([plan.endDate.getFullYear(), plan.endDate.getMonth(), plan.endDate.getDate()], [2026, 10, 8]);
  assert.deepEqual([plan.orderDate.getMonth(), plan.orderDate.getDate()], [10, 3]);
  assert.equal(plan.orderNow, false);
  assert.equal(budget.kilograms(plan.missingGrams), "3 kg");
  assert.equal(budget.dateText(plan.orderDate), "mardi 3 novembre 2026");
});

test("sac en cours : achat à anticiper dès aujourd'hui, sac couvrant 30 jours, saisies invalides", () => {
  const today = new Date(2026, 9, 29);
  const urgent = budget.remainingPlan({ rationGrams: 150, remainingGrams: 300, leadDays: 3, marginDays: 0, today });
  assert.equal(urgent.orderNow, true);
  // Jours restants entiers, cohérents avec la date de fin : 1,2 kg à 95 g/jour = 12 jours pleins.
  assert.equal(budget.remainingPlan({ rationGrams: 95, remainingGrams: 1200, today }).wholeDays, 12);
  assert.deepEqual([urgent.orderDate.getMonth(), urgent.orderDate.getDate()], [9, 29]);
  assert.equal(budget.remainingPlan({ rationGrams: 150, remainingGrams: 6000, today }).missingGrams, 0);
  assert.equal(budget.remainingPlan({ rationGrams: 0, remainingGrams: 1500, today }).status, "invalid-ration");
  assert.equal(budget.remainingPlan({ rationGrams: 150, remainingGrams: NaN, today }).status, "invalid-remaining");
  assert.equal(budget.remainingPlan({ rationGrams: 150, remainingGrams: 1500, leadDays: 2.5, today }).status, "invalid-delay");
});

test("données de la page : croquettes uniquement, prix et poids du catalogue, rupture consultable", () => {
  const recipes = budgetRecipes(catalogue);
  assert.deepEqual(recipes.map((recipe) => recipe.slug), ["pr-12", "wc"]);
  const wellness = recipes.find((recipe) => recipe.slug === "wc");
  assert.deepEqual(wellness.formats.map((format) => [format.reference, format.label, format.weightGrams, format.publicPriceCents, format.familyPriceCents, format.orderable]), [
    ["wc-1-5", "1,5 kg", 1500, 1490, 1290, true],
    ["wc-10", "10 kg", 10000, 5990, 5690, false]
  ]);
  assert.equal(wellness.formats[1].availability, "Rupture de stock");
  assert.equal(wellness.formats[1].href, "/produits/wc-10/");
  assert.equal(wellness.formats[0].rationHref, "https://www.dynastiedorkhan.com/outils/calculateur-ration/?energie=3590&unite=kcal-kg&format=wc-1-5");
  // Poids non renseigné : format présenté, calcul expliqué comme impossible côté navigateur.
  assert.deepEqual(recipes[0].formats.map((format) => [format.label, format.weightGrams]), [["Format unique", null]]);
  assert.deepEqual(budgetRecipes({ available: false, products: [] }), []);
});

test("page Mon budget croquettes : rendu serveur, aucun prix lu dans l'adresse", async () => {
  const html = renderBudget(catalogue);
  assert.match(html, /<h1>Mon budget croquettes<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/boutique\.dynastiedorkhan\.com\/budget-croquettes\/">/);
  for (const text of ["Mon sac dure", "Coût par jour", "Budget sur 30 jours", "Quantité nécessaire sur 30 jours", "Anticiper mon prochain achat",
    "hors éventuels frais de livraison", "ration quotidienne constante", "ce n’est pas un délai de livraison garanti"]) assert.ok(html.includes(text), text);
  assert.match(html, /<script src="\/assets\/budget-croquettes\.js" defer><\/script>/);
  const source = fs.readFileSync(path.join(__dirname, "../assets/budget-croquettes.js"), "utf8");
  assert.deepEqual([...source.matchAll(/params\.get\("([^"]+)"\)/g)].map((match) => match[1]).sort(), ["format", "ration"]);
  assert.match(renderBudget({ available: false, products: [] }), /catalogue est momentanément indisponible/);

  let status = null; let body = "";
  const res = { setHeader() {}, status(code) { status = code; return this; }, send(value) { body = value; return this; } };
  await handler({ method: "GET", query: { vue: "budget" } }, res, { listCatalogue: async () => catalogue });
  assert.equal(status, 200);
  assert.match(body, /id="budget-data"/);
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
  for (const source of ["/budget-croquettes", "/budget-croquettes/"]) assert.deepEqual(config.rewrites.find((entry) => entry.source === source), { source, destination: "/api/vitrine?vue=budget" });
});

test("fiche croquettes : lien budget prérempli avec le format affiché, mis à jour au changement de format", () => {
  const html = renderFiche(catalogue, "wc-10");
  assert.match(html, /<a class="fiche-budget-link" href="\/budget-croquettes\/\?format=wc-10" data-fiche-budget>Calculer mon budget croquettes<\/a>/);
  const variants = JSON.parse(html.match(/<script type="application\/json" id="fiche-variants">(.*?)<\/script>/s)[1]);
  assert.deepEqual(variants.map((variant) => variant.budgetHref), ["/budget-croquettes/?format=wc-1-5", "/budget-croquettes/?format=wc-10"]);
  // Produit en rupture : budget consultable, commande toujours impossible.
  assert.match(html, /data-fiche-add disabled/);
  const source = fs.readFileSync(path.join(__dirname, "../assets/vitrine.js"), "utf8");
  assert.match(source, /budgetLink\.href = variant\.budgetHref/);
});
