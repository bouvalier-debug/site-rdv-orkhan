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

// Commande possible dans les mêmes conditions que sur la fiche produit (en stock, stock faible ou « Sur commande » ouvert
// à l'achat) ; un format en rupture ou fermé à l'achat reste consultable pour la simulation, jamais commandable ici.
function orderable(variant) {
  return variant.purchasable && ["in_stock", "low_stock", "on_request"].includes(variant.state) && variant.maxOrderQuantity > 0;
}

function budgetRecipes(catalogue) {
  if (!catalogue.available) return [];
  return buildFiches(catalogue.products)
    .filter((fiche) => fiche.subcategory === "croquettes")
    .map((fiche) => ({
      slug: fiche.slug,
      name: fiche.name,
      brand: fiche.recipe.brand,
      formats: fiche.variants.map((variant) => ({
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

// Deux modes sur une seule page : « boutique » (catalogue) et « manuel » (saisie libre). Les éléments propres à un mode portent
// data-budget-only ; assets/budget-croquettes.js les affiche ou les masque selon l'onglet choisi.
const only = (mode, html) => html.replace(/^<(\w+)/, `<$1 data-budget-only="${mode}"`);

function renderBudget(catalogue) {
  const recipes = budgetRecipes(catalogue);
  const first = recipes[0];
  const unavailable = catalogue.available ? "Aucune recette de croquettes n’est proposée pour le moment." : "Le catalogue est momentanément indisponible. Merci de réessayer dans quelques instants.";
  // Sans catalogue, le mode manuel (qui n'en a pas besoin) s'ouvre directement.
  const initial = first ? "boutique" : "manuel";
  const tab = (mode, label) => `<button type="button" class="budget-tab" data-budget-tab="${mode}" aria-pressed="${mode === initial}">${label}</button>`;
  const shopFields = first
    ? only("boutique", `<label>Recette<select name="recette">${recipeOptions(recipes)}</select></label>`)
      + only("boutique", `<label>Format du sac<select name="format">${first.formats.map((format) => `<option value="${escapeHtml(format.reference)}">${escapeHtml(format.label)} — ${money(format.publicPriceCents)}</option>`).join("")}</select></label>`)
    : only("boutique", `<p class="rayon-empty">${unavailable}</p>`);
  const calculator = rationCalculatorHref(null, null);
  const body = `<section class="budget" aria-labelledby="budget-title">`
      + `<div class="budget-tabs" role="group" aria-label="Type de croquettes">${tab("boutique", "Croquettes de la boutique")}${tab("manuel", "Autres croquettes")}</div>`
      + `<h2 id="budget-title">Votre sac et votre chien</h2>`
      + `<form class="budget-form" data-budget-form data-budget-initial="${initial}" novalidate>`
      + shopFields
      + only("manuel", `<label>Nom des croquettes (facultatif)<input name="nom" maxlength="60" autocomplete="off" placeholder="Mes croquettes"></label>`)
      + only("manuel", `<label>Prix du sac (€)<input name="prix" inputmode="decimal" autocomplete="off" placeholder="59,90"></label>`)
      + only("manuel", `<label>Poids du sac (kg)<input name="poids" inputmode="decimal" autocomplete="off" placeholder="12"></label>`)
      + `<label>Ration quotidienne (g/jour)<input name="ration" inputmode="decimal" autocomplete="off" placeholder="150"></label>`
      + `<p class="budget-hint">Vous ne la connaissez pas ?</p>`
      + `<a class="btn-voir" data-budget-out="ration-link" data-ration-base="${escapeHtml(calculator)}" href="${escapeHtml(first ? first.formats[0].rationHref : calculator)}">Calculer la ration de mon chien</a>`
      + only("boutique", `<p class="availability" data-budget-out="availability"></p>`)
      + `<p class="budget-message" data-budget-message role="status" aria-live="polite">Indiquez la ration quotidienne de votre chien pour obtenir son budget.</p>`
      + `<div class="budget-results" data-budget-results hidden aria-live="polite">`
      + `<div class="budget-cards">${card("Mon sac dure", "days")}${card("Coût par jour", "daily", true)}${card("Budget sur 30 jours", "period", true)}${card("Quantité nécessaire sur 30 jours", "quantity")}</div>`
      + `<p class="budget-purchase">Pour couvrir 30 jours sans stock à la maison, achat de <strong data-budget-out="purchase"></strong>.</p>`
      + `<p class="budget-note">Le budget sur 30 jours est un coût de consommation calculé au prorata ; l’achat correspond à des sacs entiers.</p></div>`
      + (first ? only("boutique", `<a class="btn-voir" data-budget-out="fiche" href="${escapeHtml(first.formats[0].href)}">Voir ce format dans la boutique</a>`) : "")
      + only("manuel", `<a class="budget-shop-link" href="/rayons/alimentation/croquettes/">Découvrir les croquettes de notre boutique</a>`)
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
      + only("boutique", `<p>Prix enregistrés dans la boutique, hors éventuels frais de livraison. Le prix Famille s’applique au panier après vérification de votre numéro de puce ou de votre code Famille.</p>`)
      + `</div></section>`
      + `<script type="application/json" id="budget-data">${JSON.stringify(recipes).replace(/</g, "\\u003c")}</script>`;
  return page({
    title: "Mon budget croquettes | Boutique Dynastie d'Orkhan",
    description: "Estimez la durée d'un sac de croquettes, le coût par jour et sur 30 jours, et le moment d'anticiper votre prochain achat.",
    canonical: BUDGET_PATH,
    hero: heroHtml("Mon budget croquettes", "Durée du sac, coût par jour et sur 30 jours, et date indicative pour anticiper votre prochain achat.", true),
    body,
    scripts: '<script src="/assets/budget-croquettes.js" defer></script>'
  });
}

module.exports = { budgetRecipes, renderBudget };
