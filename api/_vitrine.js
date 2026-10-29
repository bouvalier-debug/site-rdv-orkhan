"use strict";

// Phase 6 : vitrine de la Boutique rendue côté serveur (accueil, six rayons, Sur demande, fiches produit, 404), à
// partir du catalogue administré dans Orkhan Manager (déjà filtré par _orkhan-catalog.js). Aucune règle d'achat n'est
// ajoutée ici : le panier, le devis et la commande recontrôlent prix, stock et disponibilité côté serveur.
const { CATALOG_CONFIG, RED_DINGO_PRICE_CENTS } = require("./_catalog");
const { BACK_TO_TOP, FACEBOOK_FAB, RAYONS, SHOP_FOOTER, SHOP_HEADER } = require("../scripts/shop-layout");

const ORIGIN = "https://boutique.dynastiedorkhan.com";
const FICHE_SLUG = /^[a-z0-9]+([-:][a-z0-9]+)*$/;

// Calculateur de ration du site public. L'énergie métabolisable est une donnée de la recette (kcal/kg, recopiée par le
// Manager sur tous ses formats) et non du sac : seule une valeur renseignée et plausible est transmise ; sinon le
// calculateur s'ouvre sans préremplissage, pour une saisie manuelle.
const RATION_CALCULATOR_URL = "https://www.dynastiedorkhan.com/outils/calculateur-ration/";

function rationEnergy(energyKcalPerKg) {
  return Number.isSafeInteger(energyKcalPerKg) && energyKcalPerKg >= 2500 && energyKcalPerKg <= 5500 ? energyKcalPerKg : null;
}

// La référence du format accompagne le lien : elle identifie la recette pour un retour vers « Mon budget croquettes »,
// sans jamais la déduire de l'énergie (plusieurs recettes peuvent avoir la même valeur).
function rationCalculatorHref(energyKcalPerKg, reference) {
  const params = new URLSearchParams();
  const energy = rationEnergy(energyKcalPerKg);
  if (energy) { params.set("energie", String(energy)); params.set("unite", "kcal-kg"); }
  if (reference) params.set("format", reference);
  const query = params.toString();
  return query ? `${RATION_CALCULATOR_URL}?${query}` : RATION_CALCULATOR_URL;
}

// Mon budget croquettes (api/_budget-croquettes.js) : seule la référence du format est transmise, les prix sont relus.
const BUDGET_PATH = "/budget-croquettes/";

function budgetHref(reference) {
  return `${BUDGET_PATH}?format=${encodeURIComponent(reference)}`;
}

function rationLinkHtml(variant) {
  return `<div class="fiche-ration"><a class="btn-voir" href="${escapeHtml(variant.rationHref)}" data-fiche-ration>Calculer la ration avec ces croquettes</a>`
    + `<p data-fiche-ration-manual${variant.rationEnergy ? " hidden" : ""}>L’énergie de cette recette n’est pas encore renseignée : saisissez la valeur indiquée sur l’emballage (kcal/kg ou kcal/100 g).</p>`
    + `<a class="fiche-budget-link" href="${escapeHtml(variant.budgetHref)}" data-fiche-budget>Calculer mon budget croquettes</a></div>`;
}

// Scène interactive de l'accueil (VIS-02), image validée par le porteur le 21/10/2026 et conservée telle quelle
// (seulement recompressée). Les zones, en % de l'image, entourent le produit représentatif de chaque rayon ; les
// libellés et interactions sont dans le code, jamais sur l'image. labelAt : position du libellé dans la zone.
const SCENE = {
  image: "/assets/accueil/scene-boutique-1586.webp",
  sources: [["/assets/accueil/scene-boutique-800.webp", 800], ["/assets/accueil/scene-boutique-1586.webp", 1586]],
  width: 1586,
  height: 992,
  alt: "Un chiot Cavalier King Charles et un chiot Bullmastiff entourés de six produits de la boutique : croquettes, gamelles, collier, médaille, shampooing et peluche.",
  zones: {
    ALIMENTATION: { product: "les croquettes", left: 5.7, top: 6.9, width: 23.5, height: 52.6, labelAt: "bottom" },
    ACCESSOIRES: { product: "les gamelles", left: 0.5, top: 60, width: 34.9, height: 22.9, labelAt: "center" },
    SELLERIE: { product: "le collier", left: 37.5, top: 70.6, width: 22.4, height: 15.1, labelAt: "below" },
    IDENTIFICATION: { product: "la médaille", left: 62.4, top: 75.6, width: 7.9, height: 12.6, labelAt: "below" },
    HYGIENE_SOINS: { product: "le shampooing", left: 78.1, top: 17.6, width: 8.7, height: 46.4, labelAt: "bottom" },
    JOUETS: { product: "la peluche", left: 73.1, top: 64.5, width: 26.9, height: 25.7, labelAt: "center" }
  }
};

// Parcours spéciaux conservés (Identification). Les cosmétiques Artero ne sont plus proposés (aucun stock à l'élevage).
const PARCOURS = {
  IDENTIFICATION: [
    { href: "/medailles-connectees/", name: "Médaille connectée Animoco", photo: "/medailles-connectees/assets/medaille-animoco-recto-verso.webp", price: CATALOG_CONFIG.animoco.publicPriceCents, familyPrice: CATALOG_CONFIG.animoco.familyPriceCents, note: "Livraison en France ou retrait à l’élevage" },
    { href: "/medailles-gravees/", name: "Médaille gravée Red Dingo", photo: "/medailles-gravees/assets/medaille-chien-plage-red-dingo.jpg", price: RED_DINGO_PRICE_CENTS, note: "Gravure et livraison comprises" }
  ]
};

// Phase 7 : photographies Artero d'origine (déjà publiées sur l'ancienne page cosmétiques), utilisées tant qu'un produit
// du catalogue n'a pas de photo téléversée dans le Manager ; les photos du Manager ont toujours priorité.
const ARTERO_PHOTOS = Object.freeze({
  "artero-block": [["/cosmetiques/assets/artero-block.webp", "Spray solaire Artero Block"], ["/cosmetiques/assets/artero-block-ete.jpg", "Artero Block en situation, protection du pelage au soleil"]],
  "artero-bye-bye-300-ml": [["/cosmetiques/assets/artero-bye-bye.jpg", "Shampooing répulsif Artero Bye Bye 300 ml"], ["/cosmetiques/assets/bye-bye-usage.jpg", "Shampooing Artero Bye Bye en usage"]],
  "artero-samba": [["/cosmetiques/assets/artero-samba.jpg", "Serviette ultra-absorbante Artero Samba"], ["/cosmetiques/assets/artero-samba-ete.jpg", "Serviette Artero Samba après la baignade"]],
  "artero-dfender": [["/cosmetiques/assets/artero-dfender.jpg", "Baume Artero Dfender pour coussinets et truffe"], ["/cosmetiques/assets/dfender-usage.jpg", "Artero Dfender en usage"], ["/cosmetiques/assets/dfender-ingredients.jpg", "Composition du baume Artero Dfender"]],
  "artero-pack-ete-complet": [["/assets/artero/routine-ete-artero.webp", "Pack Été complet : Artero Block, Bye Bye, Samba et Dfender"]]
});

function fallbackPhotos(reference) {
  return (ARTERO_PHOTOS[reference] || []).map(([url, altText]) => ({ url, width: null, height: null, altText }));
}

const AVAILABILITY_LABELS = {
  in_stock: "En stock",
  low_stock: "Stock faible",
  out_of_stock: "Rupture de stock",
  on_request: "Sur commande",
  soon: "Bientôt disponible"
};
const AVAILABILITY_RANK = ["in_stock", "low_stock", "out_of_stock", "soon", "on_request"];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function money(cents) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/\u202f/g, "\u00a0");
}

function rayonBySlug(slug) {
  return RAYONS.find((rayon) => rayon.slug === slug) || null;
}

function rayonByKey(key) {
  return RAYONS.find((rayon) => rayon.key === key) || null;
}

// L'état transmis par le Manager fait foi ; le repli conserve les anciennes réponses dépourvues d'availability.
function variantAvailability(product) {
  if (product.onRequest) return "on_request";
  if (["in_stock", "low_stock", "out_of_stock", "on_request"].includes(product.availability)) return product.availability;
  if (!product.purchasable) return "soon";
  if (product.maxOrderQuantity <= 0) return "out_of_stock";
  return product.availability === "low_stock" ? "low_stock" : "in_stock";
}

// CAT-02 / C5 : une fiche par groupe de variantes (chaque format garde sa référence, son prix et son stock), sinon une
// fiche par produit. Seuls les produits visibles sont présentés.
function buildFiches(products) {
  const groups = new Map();
  for (const product of products) {
    if (!product || !product.listed) continue;
    const key = product.variantGroup ? `g:${product.variantGroup}` : `r:${product.reference}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return [...groups.values()].map((items) => {
    const variants = items.slice().sort((a, b) => {
      const orderA = Number.isSafeInteger(a.displayOrder) ? a.displayOrder : null;
      const orderB = Number.isSafeInteger(b.displayOrder) ? b.displayOrder : null;
      if (orderA !== null || orderB !== null) {
        if (orderA === null) return 1;
        if (orderB === null) return -1;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      }
      return a.publicPriceCents - b.publicPriceCents || a.reference.localeCompare(b.reference);
    })
      .map((product) => ({ ...product, state: variantAvailability(product) }));
    const first = variants[0];
    const prices = variants.map((variant) => variant.publicPriceCents);
    const familyPrices = variants.map((variant) => variant.familyPriceCents).filter(Number.isInteger);
    return {
      slug: first.variantGroup || first.reference,
      name: first.name,
      shelf: first.shelf,
      subcategory: first.subcategory,
      onRequest: variants.every((variant) => variant.onRequest),
      isNew: variants.some((variant) => variant.isNew && !variant.onRequest),
      publishedAt: variants.map((variant) => variant.publishedAt).filter(Boolean).sort().at(-1) || null,
      description: variants.find((variant) => variant.description)?.description || "",
      photos: variants.find((variant) => variant.photos.length)?.photos || fallbackPhotos(first.reference),
      variants,
      recipe: recipeOf(variants),
      price: Math.min(...prices),
      priceFrom: new Set(prices).size > 1,
      familyPrice: familyPrices.length ? Math.min(...familyPrices) : null,
      familyPriceFrom: new Set(familyPrices).size > 1,
      state: AVAILABILITY_RANK.find((state) => variants.some((variant) => variant.state === state))
    };
  });
}

// Filtres Marque et Profil des croquettes. Un produit non renseigné n'a ni marque ni profil : il reste visible sous « Tous ».
const PROFILE_CHIPS = [["puppy", "Chiot"], ["adult", "Adulte"], ["diet", "Stérilisé / light"], ["senior", "Senior"], ["active", "Actif"]];

function profileTokens(recipe) {
  const tokens = [...recipe.lifeStages];
  if (recipe.traits.includes("sterilised") || recipe.traits.includes("light")) tokens.push("diet");
  if (recipe.traits.includes("active")) tokens.push("active");
  return tokens;
}

function recipeOf(variants) {
  const source = variants.find((variant) => variant.brand || variant.lifeStages.length || variant.traits.length) || variants[0];
  return { brand: source.brand || null, lifeStages: source.lifeStages || [], traits: source.traits || [], dogSize: source.dogSize || null, energyKcalPerKg: source.energyKcalPerKg || null };
}

function recipeFilters(fiches) {
  if (!fiches.length || !fiches.every((fiche) => fiche.subcategory === "croquettes")) return "";
  const brands = [...new Set(fiches.map((fiche) => fiche.recipe.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const present = new Set(fiches.flatMap((fiche) => profileTokens(fiche.recipe)));
  const chips = PROFILE_CHIPS.filter(([token]) => present.has(token));
  if (!brands.length && !chips.length) return "";
  return `<form class="recipe-filters" data-recipe-filters hidden aria-label="Filtrer les croquettes">`
    + (brands.length ? `<label class="recipe-filter-brand"><span>Marque</span><select name="brand"><option value="">Toutes</option>${brands.map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join("")}</select></label>` : "")
    + (chips.length ? `<fieldset class="recipe-filter-profile"><legend>Profil</legend>${chips.map(([token, label]) => `<label class="recipe-chip"><input type="checkbox" name="profile" value="${token}"><span>${label}</span></label>`).join("")}</fieldset>` : "")
    + `<button class="recipe-filter-reset" type="button" data-recipe-reset>Réinitialiser</button><p class="recipe-filter-count" data-recipe-count role="status" aria-live="polite"></p></form>`;
}

function findFiche(fiches, slug) {
  return fiches.find((fiche) => fiche.slug === slug)
    || fiches.find((fiche) => fiche.variants.some((variant) => variant.reference === slug))
    || null;
}

function priceText(cents, from) {
  return `${from ? "À partir de " : ""}${money(cents)}`;
}

function variantAxes(variants) {
  const first = variants[0]?.variantOptions;
  if (!Array.isArray(first) || !first.length) return null;
  const axes = first.map((option) => option.axis);
  if (!variants.every((variant) => Array.isArray(variant.variantOptions) && variant.variantOptions.length === axes.length
    && variant.variantOptions.every((option, index) => option.axis === axes[index]))) return null;
  const combinations = variants.map((variant) => JSON.stringify(variant.variantOptions.map((option) => option.value)));
  return new Set(combinations).size === variants.length ? axes : null;
}

function variantChoices(variants, current) {
  if (variants.length < 2) return "";
  const axes = variantAxes(variants);
  if (!axes) return `<fieldset class="fiche-variants"><legend>Format</legend>${variants.map((variant) => `<label><input type="radio" name="variant" value="${escapeHtml(variant.reference)}"${variant.reference === current.reference ? " checked" : ""}><span>${escapeHtml(variant.label)}</span><small>${variant.price}</small></label>`).join("")}</fieldset>`;
  return `<div class="fiche-variant-axes" data-variant-axes>${axes.map((axis, index) => {
    const values = [...new Set(variants.map((variant) => variant.variantOptions[index].value))];
    return `<fieldset class="fiche-variants" data-variant-axis="${index}"><legend>${escapeHtml(axis)}</legend>${values.map((value) => {
      const possible = variants.some((variant) => variant.variantOptions[index].value === value
        && variant.variantOptions.slice(0, index).every((option, previous) => option.value === current.variantOptions[previous].value));
      return `<label><input type="radio" name="variant-axis-${index}" value="${escapeHtml(value)}"${value === current.variantOptions[index].value ? " checked" : ""}${possible ? "" : " disabled"}><span>${escapeHtml(value)}</span></label>`;
    }).join("")}</fieldset>`;
  }).join("")}</div>`;
}

// B6 : la description du Manager (un seul champ texte) peut contenir des paragraphes, des intertitres (ligne courte se
// terminant par « : ») et des listes (« - » ou « • »), pour présenter caractéristiques, composition et conseils.
function descriptionHtml(text) {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const out = [];
    let list = [];
    const paragraph = [];
    const flush = () => { if (list.length) out.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`); list = []; };
    const flushParagraph = () => { if (paragraph.length) out.push(`<p>${paragraph.map(escapeHtml).join("<br>")}</p>`); paragraph.length = 0; };
    for (const line of lines) {
      const item = line.match(/^[-•*]\s+(.*)$/);
      if (item) { flushParagraph(); list.push(item[1]); continue; }
      flush();
      if (line.length <= 60 && line.endsWith(":")) { flushParagraph(); out.push(`<h3>${escapeHtml(line.slice(0, -1).trim())}</h3>`); } else paragraph.push(line);
    }
    flush();
    flushParagraph();
    return out.join("");
  }).join("");
}

function photoHtml(photo, className, loading = "lazy") {
  const size = photo.width && photo.height ? ` width="${photo.width}" height="${photo.height}"` : "";
  return `<img class="${className}" src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.altText)}" loading="${loading}"${size}>`;
}

// C1 à C4 : carte compacte, sans description ni achat ; photo, nom, prix (ou « À partir de »), prix Famille,
// disponibilité et seul bouton « Voir le produit ».
function ficheCard(fiche) {
  const href = `/produits/${encodeURIComponent(fiche.slug)}/`;
  const photo = fiche.photos[0];
  const recipe = fiche.recipe;
  const filterData = recipe && recipe.brand ? ` data-brand="${escapeHtml(recipe.brand)}"` : "";
  const profileData = recipe && profileTokens(recipe).length ? ` data-profile="${profileTokens(recipe).join(" ")}"` : "";
  return `<article class="product-tile"${filterData}${profileData}><a class="product-tile-photo" href="${href}" tabindex="-1" aria-hidden="true">${photo ? photoHtml(photo, "") : `<span class="product-tile-placeholder">Photo à venir</span>`}</a>`
    + `<div class="product-tile-body"><h3><a href="${href}">${escapeHtml(fiche.name)}</a></h3>`
    + (fiche.onRequest ? "" : `<p class="product-price">${priceText(fiche.price, fiche.priceFrom)}</p>`)
    + (fiche.familyPrice !== null && !fiche.onRequest ? `<p class="family-price">Prix Famille Dynastie : ${priceText(fiche.familyPrice, fiche.familyPriceFrom)}</p>` : "")
    + `<p class="availability availability-${fiche.state}">${AVAILABILITY_LABELS[fiche.state]}</p>`
    + `<a class="btn-voir" href="${href}">Voir le produit</a></div></article>`;
}

function parcoursCard(item) {
  return `<article class="product-tile"><a class="product-tile-photo" href="${item.href}" tabindex="-1" aria-hidden="true"><img src="${item.photo}" alt="" loading="lazy"></a>`
    + `<div class="product-tile-body"><h3><a href="${item.href}">${escapeHtml(item.name)}</a></h3><p class="product-price">${priceText(item.price, item.fromPrice)}</p>`
    + (Number.isInteger(item.familyPrice) ? `<p class="family-price">Prix Famille Dynastie : ${money(item.familyPrice)}</p>` : "")
    + `<p class="availability availability-parcours">${escapeHtml(item.note)}</p><a class="btn-voir" href="${item.href}">Voir le produit</a></div></article>`;
}

function page({ title, description, canonical, body, robots, hero, scripts = "" }) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${canonical ? `<link rel="canonical" href="${ORIGIN}${canonical}">` : ""}${robots ? `<meta name="robots" content="${robots}">` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&amp;family=Manrope:wght@400;600;700;800;900&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/orkhan-design.css">
  <link rel="stylesheet" href="/assets/vitrine.css">
</head>
<body>
<main class="vitrine">
  ${SHOP_HEADER}
  ${hero || ""}
  ${body}
  ${SHOP_FOOTER}
</main>
${FACEBOOK_FAB}${BACK_TO_TOP}
<script src="/assets/cart.js"></script>
${scripts}
</body>
</html>
`;
}

function heroHtml(title, subtitle, compact, subtitleHtml) {
  return `<section class="hero${compact ? " hero-compact" : ""}"><div class="hero-copy"><p class="eyebrow">Élevage de la Dynastie d’Orkhan</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${subtitleHtml || escapeHtml(subtitle)}</p>` : ""}</div></section>`;
}

function rayonsNav(current) {
  return `<nav class="rayon-chips" aria-label="Rayons">${RAYONS.map((rayon) => `<a href="/rayons/${rayon.slug}/"${rayon.key === current ? ' aria-current="page"' : ""}>${rayon.label}</a>`).join("")}</nav>`;
}

function emptyRayon() {
  return '<p class="rayon-empty">Produits prochainement disponibles.</p>';
}

// Chaque zone est un lien ordinaire (clic, clavier, toucher) ; aucun accès ne dépend du survol.
function sceneHtml(scene) {
  if (!scene) return "";
  const zones = RAYONS.filter((rayon) => scene.zones?.[rayon.key]).map((rayon) => {
    const zone = scene.zones[rayon.key];
    const label = `Rayon ${rayon.label}${zone.product ? ` : ${zone.product}` : ""}`;
    // Petits produits (médaille, flacon) : zone tactile élargie sur mobile pour atteindre environ 44 px.
    return `<a class="scene-zone scene-label-${zone.labelAt || "bottom"}${zone.width < 10 ? " scene-zone-small" : ""}" href="/rayons/${rayon.slug}/" aria-label="${escapeHtml(label)}" style="left:${zone.left}%;top:${zone.top}%;width:${zone.width}%;height:${zone.height}%"><span aria-hidden="true">${rayon.label}</span></a>`;
  }).join("");
  const srcset = (scene.sources || []).map(([url, width]) => `${url} ${width}w`).join(", ");
  return `<section class="home-section home-scene" aria-labelledby="scene-title"><h2 id="scene-title">Explorez la boutique</h2><p class="scene-hint">Choisissez un produit pour découvrir son rayon.</p>`
    + `<div class="scene-frame"><img src="${scene.image}"${srcset ? ` srcset="${srcset}" sizes="(max-width: 1220px) calc(100vw - 28px), 1180px"` : ""} alt="${escapeHtml(scene.alt)}" width="${scene.width}" height="${scene.height}" decoding="async">${zones}</div></section>`;
}

function latestFiches(fiches) {
  return fiches.filter((fiche) => fiche.isNew && fiche.shelf && !fiche.onRequest)
    .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
}

function renderAccueil(catalogue) {
  const fiches = catalogue.available ? buildFiches(catalogue.products) : [];
  const nouveautes = latestFiches(fiches).slice(0, 12);
  const tiles = RAYONS.map((rayon) => {
    return `<a class="rayon-tile" href="/rayons/${rayon.slug}/"><strong>${rayon.label}</strong><span>${Object.values(rayon.subcategories).join(" · ")}</span>`
      + '<em aria-hidden="true"><b>→</b></em></a>';
  }).join("");
  const body = sceneHtml(SCENE)
    + '<section class="home-section home-promises"><p><strong>Retrait gratuit à l’élevage</strong> pour les articles de la boutique</p><p class="home-promise-family"><span class="home-promise-badge" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path d="M9 7h35l16 25-16 25H9a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5Z"/><circle cx="13" cy="32" r="3"/><text x="34" y="42" text-anchor="middle">%</text></svg></span><span class="home-promise-copy"><strong>Un tarif réduit pour nos familles adoptantes</strong><span>Activez votre Tarif Famille Dynastie avec le numéro de puce de votre chien ou votre code Famille.</span></span></p><p><strong>Paiement sécurisé</strong> en ligne</p></section>'
    + `<section class="home-section" aria-labelledby="rayons-title"><h2 id="rayons-title">Nos rayons</h2><div class="rayon-grid">${tiles}<a class="rayon-tile" href="/sur-demande/"><strong>Produits sur commande</strong><span>Découvrez les produits proposés sur commande.</span><em aria-hidden="true"><b>→</b></em></a></div></section>`
    + (nouveautes.length ? `<section class="home-section" id="nouveautes" aria-labelledby="nouveautes-title"><div class="nouveautes-heading"><h2 id="nouveautes-title">Nos nouveautés</h2><div class="nouveautes-controls"><button type="button" class="nouveautes-arrow" data-carousel-prev aria-label="Nouveautés précédentes" aria-controls="nouveautes-list" disabled>←</button><button type="button" class="nouveautes-arrow" data-carousel-next aria-label="Nouveautés suivantes" aria-controls="nouveautes-list">→</button></div></div><div class="nouveautes-carousel" id="nouveautes-list" role="region" aria-label="Derniers produits publiés" tabindex="0">${nouveautes.map(ficheCard).join("")}</div><a class="nouveautes-all" href="/nouveautes/">Voir toutes les nouveautés</a></section>` : "");
  return page({
    title: "Boutique de l'Élevage de la Dynastie d'Orkhan | Alimentation, sellerie, médailles et soins",
    description: "La boutique de l'Élevage de la Dynastie d'Orkhan : alimentation, sellerie, identification, jouets, accessoires, hygiène et soins pour votre chien. Retrait gratuit à l'élevage.",
    canonical: "/",
    hero: heroHtml("La boutique de l’élevage", "Les produits que nous utilisons et recommandons pour nos Cavaliers King Charles et nos Bullmastiffs."),
    body,
    scripts: nouveautes.length ? '<script src="/assets/nouveautes-carousel.js" defer></script>' : ""
  });
}

function renderNouveautes(catalogue, requestedPage = 1) {
  const items = catalogue.available ? latestFiches(buildFiches(catalogue.products)) : [];
  const pageNumber = Number(requestedPage);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return null;
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  if (pageNumber > pages) return null;
  const pageItems = items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const link = (number, label) => `<a href="/nouveautes/${number > 1 ? `?page=${number}` : ""}">${label}</a>`;
  const pagination = pages > 1 ? `<nav class="pagination" aria-label="Pages des nouveautés">${pageNumber > 1 ? link(pageNumber - 1, "← Précédente") : ""}<span>Page ${pageNumber} sur ${pages}</span>${pageNumber < pages ? link(pageNumber + 1, "Suivante →") : ""}</nav>` : "";
  return page({
    title: `Toutes les nouveautés${pageNumber > 1 ? ` — page ${pageNumber}` : ""} | Boutique Dynastie d'Orkhan`,
    description: "Retrouvez tous les produits récemment publiés dans la boutique de l'Élevage de la Dynastie d'Orkhan.",
    canonical: `/nouveautes/${pageNumber > 1 ? `?page=${pageNumber}` : ""}`,
    hero: heroHtml("Toutes les nouveautés", "Les derniers produits publiés dans la boutique.", true),
    body: `<section class="rayon-listing"><h2>Nos nouveautés</h2>${pageItems.length ? `<div class="product-grid">${pageItems.map(ficheCard).join("")}</div>` : '<p class="rayon-empty">Aucune nouveauté pour le moment.</p>'}${pagination}</section>`
  });
}

function recipeEmpty(fiches) {
  return recipeFilters(fiches) ? '<p class="rayon-empty" data-recipe-empty hidden>Aucune recette ne correspond à ces filtres. Réinitialisez-les pour revoir toutes les croquettes.</p>' : "";
}

function renderRayon(catalogue, slug) {
  const rayon = rayonBySlug(slug);
  if (!rayon) return null;
  const fiches = catalogue.available ? buildFiches(catalogue.products).filter((fiche) => fiche.shelf === rayon.key && !fiche.onRequest) : [];
  const parcours = PARCOURS[rayon.key] || [];
  let listing;
  if (!catalogue.available && !parcours.length) listing = '<p class="rayon-empty">Le catalogue est momentanément indisponible. Merci de réessayer dans quelques instants.</p>';
  else if (!fiches.length && !parcours.length) listing = emptyRayon();
  else {
    const sections = Object.entries(rayon.subcategories).map(([key, label]) => [label, fiches.filter((fiche) => fiche.subcategory === key)]).filter(([, items]) => items.length);
    const others = fiches.filter((fiche) => !rayon.subcategories[fiche.subcategory]);
    const grouped = sections.length > 1 || (sections.length === 1 && others.length);
    listing = (parcours.length ? `<div class="product-grid">${parcours.map(parcoursCard).join("")}</div>` : "")
      + (grouped
        ? sections.map(([label, items]) => `<h2 class="subcategory-title">${escapeHtml(label)}</h2>${recipeFilters(items)}<div class="product-grid">${items.map(ficheCard).join("")}</div>${recipeEmpty(items)}`).join("")
          + (others.length ? `<h2 class="subcategory-title">Autres articles</h2><div class="product-grid">${others.map(ficheCard).join("")}</div>` : "")
        : fiches.length ? `${recipeFilters(fiches)}<div class="product-grid">${fiches.map(ficheCard).join("")}</div>${recipeEmpty(fiches)}` : "");
  }
  return page({
    title: `${rayon.label} | Boutique Dynastie d'Orkhan`,
    description: `Rayon ${rayon.label} de la boutique de l'Élevage de la Dynastie d'Orkhan : ${Object.values(rayon.subcategories).join(", ").toLocaleLowerCase("fr")}.`,
    canonical: `/rayons/${rayon.slug}/`,
    hero: heroHtml(rayon.label, Object.values(rayon.subcategories).join(" · "), true),
    body: `${rayonsNav(rayon.key)}<section class="rayon-listing" aria-label="Articles du rayon ${escapeHtml(rayon.label)}">${listing}</section>`,
    scripts: listing.includes("data-recipe-filters") ? '<script src="/assets/recipe-filters.js" defer></script>' : ""
  });
}

function renderSurDemande(catalogue) {
  const fiches = catalogue.available ? buildFiches(catalogue.products).filter((fiche) => fiche.onRequest) : [];
  return page({
    title: "Produits sur commande | Boutique Dynastie d'Orkhan",
    description: "Produits sur commande de l'Élevage de la Dynastie d'Orkhan : à consulter en ligne, non achetables directement sur la boutique.",
    canonical: "/sur-demande/",
    hero: heroHtml("Produits sur commande", "Découvrez les produits proposés sur commande. Pour connaître les disponibilités et les modalités, contactez l’élevage.", true, 'Découvrez les produits proposés sur commande. Pour connaître les disponibilités et les modalités, <a href="https://www.dynastiedorkhan.com/contact/">contactez l’élevage</a>.'),
    body: `${rayonsNav(null)}<section class="rayon-listing">${fiches.length ? `<div class="product-grid">${fiches.map(ficheCard).join("")}</div>` : '<p class="rayon-empty">Aucun produit sur commande pour le moment.</p>'}</section>`
  });
}

// C5 / CAT-02 : chaque variante garde sa référence, son prix, son stock et sa galerie résolue par le Manager.
function renderFiche(catalogue, slug) {
  if (!catalogue.available || typeof slug !== "string" || !FICHE_SLUG.test(slug)) return null;
  const fiche = findFiche(buildFiches(catalogue.products), slug);
  if (!fiche) return null;
  const rayon = rayonByKey(fiche.shelf);
  const croquettes = fiche.subcategory === "croquettes";
  const selected = fiche.variants.find((variant) => variant.reference === slug) || fiche.variants.find((variant) => variant.state === "in_stock" || variant.state === "low_stock") || fiche.variants[0];
  const variants = fiche.variants.map((variant) => ({
    reference: variant.reference,
    label: variant.variantLabel || variant.name,
    price: money(variant.publicPriceCents),
    familyPrice: Number.isInteger(variant.familyPriceCents) ? money(variant.familyPriceCents) : null,
    state: variant.state,
    availability: AVAILABILITY_LABELS[variant.state],
    maxQuantity: variant.purchasable && (variant.state === "in_stock" || variant.state === "low_stock") ? variant.maxOrderQuantity : 0,
    variantOptions: variant.variantOptions,
    photos: variant.photos.length ? variant.photos : fiche.photos,
    // Énergie du format affiché, jamais déduite d'un autre format ni du poids du sac.
    ...(croquettes ? { rationHref: rationCalculatorHref(variant.energyKcalPerKg, variant.reference), rationEnergy: rationEnergy(variant.energyKcalPerKg), budgetHref: budgetHref(variant.reference) } : {})
  }));
  const current = variants.find((variant) => variant.reference === selected.reference);
  const photos = current.photos;
  const gallery = photos.length
    ? `<div class="fiche-gallery">${photoHtml(photos[0], "fiche-photo", "eager").replace("<img", '<img data-fiche-photo')}<div class="fiche-thumbs" data-fiche-thumbs${photos.length > 1 ? "" : " hidden"}>${photos.map((photo, index) => `<button type="button" data-photo-index="${index}"${index === 0 ? ' aria-current="true"' : ""}>${photoHtml(photo, "")}</button>`).join("")}</div></div>`
    : `<div class="fiche-gallery"><span class="product-tile-placeholder fiche-photo">Photo à venir</span></div>`;
  const choice = variantChoices(variants, current);
  const purchase = fiche.onRequest
    ? '<p class="fiche-on-request">Produit sur commande, non achetable directement en ligne. <a href="https://www.dynastiedorkhan.com/contact/">Contactez-nous</a> pour en parler.</p>'
    : `<div class="fiche-buy"><label>Quantité<input type="number" data-fiche-quantity min="1" max="${Math.max(current.maxQuantity, 1)}" value="1"${current.maxQuantity ? "" : " disabled"}></label><button type="button" class="btn-primary" data-fiche-add${current.maxQuantity ? "" : " disabled"}>Ajouter au panier</button></div><p class="fiche-pickup">Retrait gratuit à l’élevage, sur rendez-vous.</p>`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: fiche.name, sku: current.reference,
    ...(fiche.description ? { description: fiche.description.slice(0, 500) } : {}),
    ...(photos.length ? { image: photos.map((photo) => `${ORIGIN}${photo.url}`) } : {}),
    ...(fiche.onRequest ? {} : { offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: (fiche.price / 100).toFixed(2), highPrice: (Math.max(...fiche.variants.map((variant) => variant.publicPriceCents)) / 100).toFixed(2), offerCount: fiche.variants.length } })
  };
  const body = `<nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="/">Accueil</a>${rayon ? ` › <a href="/rayons/${rayon.slug}/">${rayon.label}</a>` : fiche.onRequest ? ' › <a href="/sur-demande/">Produits sur commande</a>' : ""} › <span>${escapeHtml(fiche.name)}</span></nav>`
    + `<article class="fiche" data-fiche><div class="fiche-media">${gallery}</div><div class="fiche-info"><h1>${escapeHtml(fiche.name)}</h1>${choice}`
    + (fiche.onRequest ? "" : `<p class="product-price fiche-price" data-fiche-price>${current.price}</p><p class="family-price" data-fiche-family${current.familyPrice ? "" : " hidden"}>Prix Famille Dynastie : <span>${current.familyPrice || ""}</span></p>`)
    + `<p class="availability availability-${current.state}" data-fiche-availability>${current.availability}</p>${purchase}`
    + (croquettes ? rationLinkHtml(current) : "")
    + (fiche.familyPrice !== null && !fiche.onRequest ? '<p class="fiche-family-note">Le prix Famille s’applique au panier après vérification de votre numéro de puce ou de votre code Famille.</p>' : "")
    + `<p class="fiche-ref">Référence : <span data-fiche-ref>${escapeHtml(current.reference)}</span></p></div></article>`
    + (fiche.description ? `<section class="fiche-description"><h2>Description</h2>${descriptionHtml(fiche.description)}</section>` : "")
    + `<script type="application/json" id="fiche-variants">${JSON.stringify(variants).replace(/</g, "\\u003c")}</script>`
    + `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  return page({
    title: `${fiche.name} | Boutique Dynastie d'Orkhan`,
    description: (fiche.description || `${fiche.name}, disponible à la boutique de l'Élevage de la Dynastie d'Orkhan.`).replace(/\s+/g, " ").slice(0, 155),
    canonical: `/produits/${encodeURIComponent(fiche.slug)}/`,
    body,
    scripts: '<script src="/assets/product-cart.js"></script>\n<script src="/assets/vitrine.js"></script>'
  });
}

function renderNotFound() {
  return page({
    title: "Page introuvable | Boutique Dynastie d'Orkhan",
    description: "Cette page de la boutique n'existe pas ou n'est plus disponible.",
    robots: "noindex",
    body: `<section class="not-found"><h1>Page introuvable</h1><p>Cette page n’existe pas ou n’est plus disponible.</p><a class="btn-primary" href="/">Retour à la Boutique</a></section>${rayonsNav(null)}`
  });
}

module.exports = {
  ARTERO_PHOTOS, AVAILABILITY_LABELS, BUDGET_PATH, PARCOURS, RATION_CALCULATOR_URL, SCENE, budgetHref, buildFiches, descriptionHtml, escapeHtml, findFiche, ficheCard, heroHtml, money,
  page, rationCalculatorHref, rayonBySlug, renderAccueil, renderFiche, renderNotFound, renderNouveautes, renderRayon, renderSurDemande, sceneHtml, variantAvailability
};
