// Mon budget croquettes : autonomie du sac, coût par jour et sur 30 jours, anticipation du prochain achat.
// Les prix et les poids viennent du catalogue de la boutique rendu dans la page (jamais de l'adresse). Les calculs
// gardent la précision complète ; seul l'affichage arrondit. Estimations pratiques, pas une prescription alimentaire.
(function budgetCroquettes(root) {
  "use strict";

  const PERIOD_DAYS = 30;
  const MAX_RATION_GRAMS = 3000;
  const MAX_REMAINING_GRAMS = 100000;
  const MAX_DELAY_DAYS = 60;
  const DAY_MS = 86400000;

  function parseAmount(value) {
    const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
    return Number(text);
  }

  function validRation(grams) {
    return Number.isFinite(grams) && grams > 0 && grams <= MAX_RATION_GRAMS;
  }

  // Coût d'une quantité (g) pour un sac de bagGrams vendu priceCents, en centimes non arrondis.
  function prorata(priceCents, grams, bagGrams) {
    return Number.isInteger(priceCents) ? priceCents * grams / bagGrams : null;
  }

  // R = ration (g/jour), P = poids du sac (g), V = prix du sac (centimes, public et Famille tels qu'enregistrés).
  function bagBudget({ rationGrams, bagGrams, publicPriceCents, familyPriceCents }) {
    if (!validRation(rationGrams)) return { status: "invalid-ration" };
    if (!Number.isInteger(bagGrams) || bagGrams <= 0) return { status: "missing-bag-weight" };
    if (!Number.isInteger(publicPriceCents)) return { status: "missing-price" };
    const periodGrams = rationGrams * PERIOD_DAYS;
    // Petite tolérance : 30 jours à 250 g/jour remplissent exactement un sac de 7,5 kg, sans en exiger un second.
    const bags = Math.max(1, Math.ceil(periodGrams / bagGrams - 1e-9));
    const costs = (priceCents) => Number.isInteger(priceCents) ? {
      dailyCents: prorata(priceCents, rationGrams, bagGrams),
      periodCents: prorata(priceCents, periodGrams, bagGrams),
      purchaseCents: priceCents * bags
    } : null;
    return {
      status: "ok",
      days: bagGrams / rationGrams,
      periodGrams,
      bags,
      public: costs(publicPriceCents),
      family: costs(familyPriceCents)
    };
  }

  // Mode « autres croquettes » : prix (€) et poids (kg) saisis à la main, décimales françaises acceptées (« 59,90 € », « 7,5 kg »).
  // Les deux doivent être strictement positifs ; sinon aucun résultat n'est calculé.
  const MAX_MANUAL_PRICE_EUROS = 1000;
  const MAX_MANUAL_BAG_KG = 100;

  function parseManualBag({ priceText, weightText }) {
    const clean = (value, unit) => String(value ?? "").replace(unit, "").trim();
    const priceInput = clean(priceText, /€|eur(os?)?/gi);
    const weightInput = clean(weightText, /kg|kilos?/gi);
    const price = priceInput === "" ? null : parseAmount(priceInput);
    const weight = weightInput === "" ? null : parseAmount(weightInput);
    const priceCents = price === null ? null : Math.round(price * 100);
    const bagGrams = weight === null ? null : Math.round(weight * 1000);
    if (price !== null && !(priceCents >= 1 && price <= MAX_MANUAL_PRICE_EUROS)) return { status: "invalid-price" };
    if (weight !== null && !(bagGrams >= 1 && weight <= MAX_MANUAL_BAG_KG)) return { status: "invalid-weight" };
    if (price === null || weight === null) return { status: "missing" };
    return { status: "ok", publicPriceCents: priceCents, bagGrams };
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = startOfDay(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function validDelay(days) {
    return Number.isInteger(days) && days >= 0 && days <= MAX_DELAY_DAYS;
  }

  // Sac en cours : jours calendaires restants (arrondis vers le bas pour la date de fin), quantité manquante pour
  // couvrir 30 jours, date indicative à laquelle anticiper l'achat (délai et marge choisis par le propriétaire).
  function remainingPlan({ rationGrams, remainingGrams, leadDays = 0, marginDays = 0, today = new Date() }) {
    if (!validRation(rationGrams)) return { status: "invalid-ration" };
    if (!Number.isFinite(remainingGrams) || remainingGrams < 0 || remainingGrams > MAX_REMAINING_GRAMS) return { status: "invalid-remaining" };
    if (!validDelay(leadDays) || !validDelay(marginDays)) return { status: "invalid-delay" };
    const days = remainingGrams / rationGrams;
    const wholeDays = Math.floor(days + 1e-9);
    const start = startOfDay(today);
    const endDate = addDays(start, wholeDays);
    const anticipation = leadDays + marginDays;
    const orderDate = addDays(endDate, -anticipation);
    return {
      status: "ok",
      days,
      wholeDays,
      endDate,
      anticipation,
      orderDate: orderDate < start ? start : orderDate,
      orderNow: orderDate <= start,
      missingGrams: Math.max(0, rationGrams * PERIOD_DAYS - remainingGrams)
    };
  }

  const euroFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  function euros(cents) {
    return euroFormat.format(Math.round(cents) / 100).replace(/ /g, " ");
  }

  function kilograms(grams) {
    const kg = grams / 1000;
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: kg < 10 ? 2 : 1 }).format(kg)} kg`;
  }

  function daysText(days) {
    if (days < 1) return "moins d’un jour";
    const rounded = Math.round(days);
    return `environ ${rounded} jour${rounded > 1 ? "s" : ""}`;
  }

  function dateText(date) {
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const api = { PERIOD_DAYS, bagBudget, parseManualBag, remainingPlan, parseAmount, euros, kilograms, daysText, dateText, addDays };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  const form = document.querySelector("[data-budget-form]");
  const dataNode = document.getElementById("budget-data");
  if (!form || !dataNode) return;
  const recipes = JSON.parse(dataNode.textContent);
  const byReference = new Map();
  for (const recipe of recipes) for (const format of recipe.formats) byReference.set(format.reference, { recipe, format });
  const recipeSelect = form.elements.recette;
  const formatSelect = form.elements.format;
  const out = (name) => document.querySelector(`[data-budget-out="${name}"]`);
  const results = document.querySelector("[data-budget-results]");
  const message = document.querySelector("[data-budget-message]");
  const plan = document.querySelector("[data-budget-plan]");
  const planMessage = document.querySelector("[data-budget-plan-message]");
  const tabs = [...document.querySelectorAll("[data-budget-tab]")];
  const modePanels = [...document.querySelectorAll("[data-budget-only]")];
  // Deux modes sur la même page : « boutique » (catalogue) et « manuel » (saisie libre). Les valeurs saisies restent en place
  // quand on change d'onglet ; seuls les éléments propres à un mode sont masqués.
  let mode = form.dataset.budgetInitial === "manuel" ? "manuel" : "boutique";

  function applyMode() {
    for (const panel of modePanels) panel.hidden = panel.dataset.budgetOnly !== mode;
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.budgetTab === mode));
  }

  function fillFormats(recipe, reference) {
    formatSelect.replaceChildren(...recipe.formats.map((format) => {
      const option = document.createElement("option");
      option.value = format.reference;
      option.textContent = `${format.label} — ${euros(format.publicPriceCents)}`;
      option.selected = format.reference === reference;
      return option;
    }));
  }

  function current() {
    return formatSelect ? byReference.get(formatSelect.value) || null : null;
  }

  function setText(name, text) {
    const node = out(name);
    if (node) node.textContent = text;
  }

  function showFamily(name, cents) {
    const node = out(name);
    if (!node) return;
    node.hidden = cents === null;
    if (cents !== null) node.querySelector("span").textContent = euros(cents);
  }

  const MANUAL_MESSAGES = {
    missing: "Renseignez le prix du sac, son poids et la ration quotidienne de votre chien pour obtenir le budget.",
    "invalid-price": "Indiquez le prix du sac en euros, supérieur à 0 (par exemple 59,90).",
    "invalid-weight": "Indiquez le poids du sac en kilogrammes, supérieur à 0 (par exemple 12 ou 7,5)."
  };

  // Sac pris en compte : celui du catalogue (mode boutique) ou celui saisi à la main. Même calcul dans les deux cas.
  function currentBag(ration) {
    if (mode === "boutique") {
      const selection = current();
      if (!selection) return null;
      const { format } = selection;
      const link = out("fiche");
      link.href = format.href;
      link.textContent = format.orderable ? "Voir ce format et le commander" : "Voir ce format dans la boutique";
      setText("availability", format.availability);
      out("availability").className = `availability availability-${format.state}`;
      out("ration-link").href = format.rationHref;
      return {
        budget: bagBudget({ rationGrams: ration, bagGrams: format.weightGrams, publicPriceCents: format.publicPriceCents, familyPriceCents: format.familyPriceCents }),
        bagLabel: format.label
      };
    }
    out("ration-link").href = out("ration-link").dataset.rationBase;
    const manual = parseManualBag({ priceText: form.elements.prix.value, weightText: form.elements.poids.value });
    if (manual.status !== "ok") return { budget: { status: manual.status } };
    const name = form.elements.nom.value.trim();
    return {
      budget: bagBudget({ rationGrams: ration, bagGrams: manual.bagGrams, publicPriceCents: manual.publicPriceCents, familyPriceCents: null }),
      bagLabel: `${kilograms(manual.bagGrams)}${name ? ` (${name})` : ""}`
    };
  }

  function render() {
    applyMode();
    const ration = parseAmount(form.elements.ration.value);
    const bag = currentBag(ration);
    if (!bag) { results.hidden = true; message.hidden = true; plan.hidden = true; planMessage.hidden = true; return; }
    const { budget } = bag;
    results.hidden = budget.status !== "ok";
    message.hidden = budget.status === "ok";
    if (budget.status === "invalid-ration") message.textContent = form.elements.ration.value.trim()
      ? `Indiquez une ration quotidienne en grammes, supérieure à 0 et jusqu’à ${MAX_RATION_GRAMS} g.`
      : "Indiquez la ration quotidienne de votre chien pour obtenir son budget.";
    else if (budget.status === "missing-bag-weight") message.textContent = "Le poids de ce sac n’est pas renseigné dans la boutique : la durée et le budget ne peuvent pas être calculés pour ce format.";
    else if (budget.status === "missing-price") message.textContent = "Le prix de ce format n’est pas disponible : le budget ne peut pas être calculé.";
    else if (MANUAL_MESSAGES[budget.status]) message.textContent = MANUAL_MESSAGES[budget.status];
    if (budget.status === "ok") {
      setText("days", daysText(budget.days));
      setText("daily", euros(budget.public.dailyCents));
      setText("period", euros(budget.public.periodCents));
      setText("quantity", kilograms(budget.periodGrams));
      showFamily("daily-family", budget.family && budget.family.dailyCents);
      showFamily("period-family", budget.family && budget.family.periodCents);
      setText("purchase", `${budget.bags} sac${budget.bags > 1 ? "s" : ""} de ${bag.bagLabel} : ${euros(budget.public.purchaseCents)}`
        + (budget.family ? ` (prix Famille : ${euros(budget.family.purchaseCents)})` : ""));
    }

    const remaining = parseAmount(form.elements.reste.value) * (form.elements.resteUnite.value === "kg" ? 1000 : 1);
    const delay = (field) => field.value.trim() === "" ? 0 : Number(field.value);
    const remainingText = form.elements.reste.value.trim();
    const next = remainingText ? remainingPlan({ rationGrams: ration, remainingGrams: remaining, leadDays: delay(form.elements.delai), marginDays: delay(form.elements.marge) }) : null;
    plan.hidden = !next || next.status !== "ok";
    planMessage.hidden = !next || next.status === "ok";
    if (next && next.status !== "ok") planMessage.textContent = next.status === "invalid-ration" ? "Indiquez d’abord la ration quotidienne de votre chien."
      : next.status === "invalid-remaining" ? "Indiquez la quantité restante dans le sac (par exemple 1,5 kg ou 800 g)."
        : `Le délai et la marge s’expriment en jours entiers, de 0 à ${MAX_DELAY_DAYS}.`;
    if (next && next.status === "ok") {
      setText("left-days", next.wholeDays < 1 ? "moins d’un jour" : `${next.wholeDays} jour${next.wholeDays > 1 ? "s" : ""}`);
      setText("end-date", dateText(next.endDate));
      setText("missing", next.missingGrams > 0 ? `Il manque ${kilograms(next.missingGrams)} pour couvrir les 30 prochains jours.` : "Votre sac couvre les 30 prochains jours.");
      setText("order", next.orderNow ? "Anticipez votre achat dès aujourd’hui."
        : `Anticipez votre achat vers le ${dateText(next.orderDate)}${next.anticipation ? `, soit environ ${next.anticipation} jour${next.anticipation > 1 ? "s" : ""} avant la fin prévue du sac` : ""}.`);
    }
  }

  for (const tab of tabs) tab.addEventListener("click", () => { mode = tab.dataset.budgetTab === "manuel" ? "manuel" : "boutique"; render(); });
  if (recipeSelect) recipeSelect.addEventListener("change", () => {
    const recipe = recipes.find((item) => item.slug === recipeSelect.value);
    if (recipe) fillFormats(recipe, (recipe.formats.find((format) => format.orderable) || recipe.formats[0]).reference);
    render();
  });
  form.addEventListener("input", (event) => { if (event.target !== recipeSelect) render(); });
  form.addEventListener("change", (event) => { if (event.target !== recipeSelect) render(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });

  // Préremplissage : ?format=<référence du format> (ou de la fiche) et ?ration=<g/jour>. Aucun prix n'est lu dans l'adresse.
  const params = new URLSearchParams(location.search);
  const wanted = params.get("format");
  const selection = byReference.get(wanted) || null;
  const recipe = recipeSelect ? (selection ? selection.recipe : recipes.find((item) => item.slug === wanted) || recipes.find((item) => item.slug === recipeSelect.value) || recipes[0]) : null;
  if (recipe) {
    recipeSelect.value = recipe.slug;
    fillFormats(recipe, selection ? selection.format.reference : (recipe.formats.find((format) => format.orderable) || recipe.formats[0]).reference);
  }
  const ration = parseAmount(params.get("ration"));
  if (validRation(ration)) form.elements.ration.value = String(Math.round(ration * 10) / 10).replace(".", ",");
  render();
})(typeof globalThis !== "undefined" ? globalThis : this);
