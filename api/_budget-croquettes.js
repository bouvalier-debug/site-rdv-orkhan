"use strict";

// Mon budget croquettes : page rendue côté serveur à partir du catalogue Manager (recettes, formats, poids, prix public
// et prix Famille tels qu'enregistrés). Les calculs sont faits dans le navigateur par assets/budget-croquettes.js ;
// l'adresse ne transmet qu'une référence de format et une ration, jamais un prix.
const { AVAILABILITY_LABELS, BUDGET_PATH, buildFiches, escapeHtml, heroHtml, money, page, rationCalculatorHref } = require("./_vitrine");

function formatLabel(variant) {
  if (variant.variantLabel) return variant.variantLabel;
  if (Number.isInteger(variant.weightGrams)) return `${String(variant.weightGrams / 1000).replace(".", ",")} kg`;
  return "Format unique";
}

// Commande possible dans les mêmes conditions que sur la fiche produit ; un format en rupture reste consultable.
function orderable(variant) {
  return variant.purchasable && (variant.state === "in_stock" || variant.state === "low_stock") && variant.maxOrderQuantity > 0;
}

function budgetRecipes(catalogue) {
  if (!catalogue.available) return [];
  return buildFiches(catalogue.products)
    .filter((fiche) => fiche.subcategory === "croquettes" && !fiche.onRequest)
    .map((fiche) => ({
      slug: fiche.slug,
      name: fiche.name,
      brand: fiche.recipe.brand,
      formats: fiche.variants.filter((variant) => !variant.onRequest).map((variant) => ({
        reference: variant.reference,
        label: formatLabel(variant),
        weightGrams: Number.isInteger(variant.weightGrams) ? variant.weightGrams : null,
        publicPriceCents: variant.publicPriceCents,
        familyPriceCents: Number.isInteger(variant.familyPriceCents) ? variant.familyPriceCents : null,
        state: variant.state,
        availability: AVAILABILITY_LABELS[variant.state],
        orderable: orderable(variant),
        href: `/produits/${encodeURIComponent(variant.reference)}/`,
        rationHref: rationCalculatorHref(variant.energyKcalPerKg, variant.reference)
      }))
    }))
    .filter((recipe) => recipe.formats.length)
    .sort((a, b) => (a.brand || "\uffff").localeCompare(b.brand || "\uffff", "fr") || a.name.localeCompare(b.name, "fr"));
}

function recipeOptions(recipes) {
  const groups = new Map();
  for (const recipe of recipes) {
    const brand = recipe.brand || "Autres recettes";
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(recipe);
  }
  return [...groups].map(([brand, items]) => `<optgroup label="${escapeHtml(brand)}">${items.map((recipe) => `<option value="${escapeHtml(recipe.slug)}">${escapeHtml(recipe.name)}</option>`).join("")}</optgroup>`).join("");
}

const card = (title, name, family) => `<div class="budget-card"><span>${title}</span><strong data-budget-out="${name}"></strong>`
  + (family ? `<small data-budget-out="${name}-family" hidden>Prix Famille : <span></span></small>` : "") + "</div>";

function renderBudget(catalogue) {
  const recipes = budgetRecipes(catalogue);
  const first = recipes[0];
  const body = !recipes.length
    ? `<section class="budget"><p class="rayon-empty">${catalogue.available ? "Aucune recette de croquettes n’est proposée pour le moment." : "Le catalogue est momentanément indisponible. Merci de réessayer dans quelques instants."}</p></section>`
    : `<section class="budget" aria-labelledby="budget-title"><h2 id="budget-title">Votre sac et votre chien</h2>`
      + `<form class="budget-form" data-budget-form novalidate>`
      + `<label>Recette<select name="recette">${recipeOptions(recipes)}</select></label>`
      + `<label>Format du sac<select name="format">${first.formats.map((format) => `<option value="${escapeHtml(format.reference)}">${escapeHtml(format.label)} — ${money(format.publicPriceCents)}</option>`).join("")}</select></label>`
      + `<label>Ration quotidienne (g/jour)<input name="ration" inputmode="decimal" autocomplete="off" placeholder="150"></label>`
      + `<p class="budget-hint">Vous ne la connaissez pas ? <a data-budget-out="ration-link" href="${escapeHtml(first.formats[0].rationHref)}">Calculer la ration de mon chien</a></p>`
      + `<p class="availability" data-budget-out="availability"></p>`
      + `<p class="budget-message" data-budget-message role="status" aria-live="polite">Indiquez la ration quotidienne de votre chien pour obtenir son budget.</p>`
      + `<div class="budget-results" data-budget-results hidden aria-live="polite">`
      + `<div class="budget-cards">${card("Mon sac dure", "days")}${card("Coût par jour", "daily", true)}${card("Budget sur 30 jours", "period", true)}${card("Quantité nécessaire sur 30 jours", "quantity")}</div>`
      + `<p class="budget-purchase">Pour couvrir 30 jours sans stock à la maison, achat de <strong data-budget-out="purchase"></strong>.</p>`
      + `<p class="budget-note">Le budget sur 30 jours est un coût de consommation calculé au prorata ; l’achat correspond à des sacs entiers.</p></div>`
      + `<a class="btn-voir" data-budget-out="fiche" href="${escapeHtml(first.formats[0].href)}">Voir ce format dans la boutique</a>`
      + `<fieldset class="budget-plan"><legend>Anticiper mon prochain achat</legend><p class="budget-hint">Combien reste-t-il dans mon sac ? (facultatif)</p>`
      + `<div class="budget-row"><label>Quantité restante<input name="reste" inputmode="decimal" autocomplete="off" placeholder="1,5"></label>`
      + `<label>Unité<select name="resteUnite"><option value="kg">kg</option><option value="g">g</option></select></label></div>`
      + `<div class="budget-row"><label>Délai de réapprovisionnement estimé (jours)<input name="delai" inputmode="numeric" autocomplete="off" placeholder="0"></label>`
      + `<label>Marge de sécurité (jours)<input name="marge" inputmode="numeric" autocomplete="off" placeholder="0"></label></div>`
      + `<p class="budget-message" data-budget-plan-message hidden role="status" aria-live="polite"></p>`
      + `<div class="budget-plan-result" data-budget-plan hidden aria-live="polite"><p>Il reste <strong data-budget-out="left-days"></strong> de croquettes : sac terminé vers le <strong data-budget-out="end-date"></strong>.</p>`
      + `<p data-budget-out="missing"></p><p class="budget-order" data-budget-out="order"></p></div>`
      + `<p class="budget-note">Le délai et la marge sont choisis par vous : ce n’est pas un délai de livraison garanti par la boutique.</p></fieldset></form>`
      + `<div class="budget-notes"><p>Estimations pratiques, établies pour une ration quotidienne constante : elles ne remplacent pas un conseil alimentaire. Chez le chiot, la ration évolue avec la croissance : actualisez-la régulièrement.</p>`
      + `<p>Prix enregistrés dans la boutique, hors éventuels frais de livraison. Le prix Famille s’applique au panier après vérification de votre numéro de puce ou de votre code Famille.</p></div></section>`
      + `<script type="application/json" id="budget-data">${JSON.stringify(recipes).replace(/</g, "\\u003c")}</script>`;
  return page({
    title: "Mon budget croquettes | Boutique Dynastie d'Orkhan",
    description: "Estimez la durée d'un sac de croquettes, le coût par jour et sur 30 jours, et le moment d'anticiper votre prochain achat.",
    canonical: BUDGET_PATH,
    hero: heroHtml("Mon budget croquettes", "Durée du sac, coût par jour et sur 30 jours, et date indicative pour anticiper votre prochain achat.", true),
    body,
    scripts: recipes.length ? '<script src="/assets/budget-croquettes.js" defer></script>' : ""
  });
}

module.exports = { budgetRecipes, renderBudget };
