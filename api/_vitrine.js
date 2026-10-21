"use strict";

// Phase 6 : vitrine de la Boutique rendue côté serveur (accueil, six rayons, Sur demande, fiches produit, 404), à
// partir du catalogue administré dans Orkhan Manager (déjà filtré par _orkhan-catalog.js). Aucune règle d'achat n'est
// ajoutée ici : le panier, le devis et la commande recontrôlent prix, stock et disponibilité côté serveur.
const { CATALOG_CONFIG, RED_DINGO_PRICE_CENTS } = require("./_catalog");
const { BACK_TO_TOP, FACEBOOK_FAB, RAYONS, SHOP_FOOTER, SHOP_HEADER } = require("../scripts/shop-layout");

const ORIGIN = "https://boutique.dynastiedorkhan.com";
const FICHE_SLUG = /^[a-z0-9]+([-:][a-z0-9]+)*$/;

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

// Parcours spéciaux conservés (Identification) et accès temporaire aux cosmétiques actuels jusqu'à la phase 7.
const AMOUNT_COSMETICS = Math.min(...CATALOG_CONFIG.parcelProducts.filter((product) => product.id.startsWith("cosmetics:")).map((product) => product.priceCents));
const PARCOURS = {
  IDENTIFICATION: [
    { href: "/medailles-connectees/", name: "Médaille connectée Animoco", photo: "/medailles-connectees/assets/medaille-animoco-recto-verso.webp", price: CATALOG_CONFIG.animoco.publicPriceCents, familyPrice: CATALOG_CONFIG.animoco.familyPriceCents, note: "Livraison en France ou retrait à l’élevage" },
    { href: "/medailles-gravees/", name: "Médaille gravée Red Dingo", photo: "/medailles-gravees/assets/medaille-chien-plage-red-dingo.jpg", price: RED_DINGO_PRICE_CENTS, note: "Gravure et livraison comprises" }
  ],
  HYGIENE_SOINS: [
    { href: "/cosmetiques/", name: "Cosmétiques Artero", photo: "/cosmetiques/assets/artero-samba-ete.jpg", price: AMOUNT_COSMETICS, fromPrice: true, note: "Gamme actuelle de la boutique" }
  ]
};

const AVAILABILITY_LABELS = {
  in_stock: "En stock",
  low_stock: "Stock limité",
  out_of_stock: "Indisponible pour le moment",
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

// Disponibilité d'une variante : achetable avec stock (état du Manager), sans stock, sur demande, ou pas encore en vente.
function variantAvailability(product) {
  if (product.onRequest) return "on_request";
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
    const variants = items.slice().sort((a, b) => a.publicPriceCents - b.publicPriceCents || a.reference.localeCompare(b.reference))
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
      description: variants.find((variant) => variant.description)?.description || "",
      photos: variants.find((variant) => variant.photos.length)?.photos || [],
      variants,
      price: Math.min(...prices),
      priceFrom: new Set(prices).size > 1,
      familyPrice: familyPrices.length ? Math.min(...familyPrices) : null,
      familyPriceFrom: new Set(familyPrices).size > 1,
      state: AVAILABILITY_RANK.find((state) => variants.some((variant) => variant.state === state))
    };
  });
}

function findFiche(fiches, slug) {
  return fiches.find((fiche) => fiche.slug === slug)
    || fiches.find((fiche) => fiche.variants.some((variant) => variant.reference === slug))
    || null;
}

function priceText(cents, from) {
  return `${from ? "À partir de " : ""}${money(cents)}`;
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
  return `<article class="product-tile"><a class="product-tile-photo" href="${href}" tabindex="-1" aria-hidden="true">${photo ? photoHtml(photo, "") : `<span class="product-tile-placeholder">Photo à venir</span>`}</a>`
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

function heroHtml(title, subtitle, compact) {
  return `<section class="hero${compact ? " hero-compact" : ""}"><div class="hero-copy"><p class="eyebrow">Élevage de la Dynastie d’Orkhan</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div></section>`;
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

function renderAccueil(catalogue) {
  const fiches = catalogue.available ? buildFiches(catalogue.products) : [];
  const nouveautes = fiches.filter((fiche) => fiche.isNew && fiche.shelf);
  // Accès classiques aux six rayons : tuiles typographiques homogènes, sans illustration (la scène interactive viendra
  // au-dessus lorsque l'image définitive sera validée).
  const tiles = RAYONS.map((rayon) => {
    const count = fiches.filter((fiche) => fiche.shelf === rayon.key && !fiche.onRequest).length + (PARCOURS[rayon.key]?.length || 0);
    return `<a class="rayon-tile" href="/rayons/${rayon.slug}/"><strong>${rayon.label}</strong><span>${Object.values(rayon.subcategories).join(" · ")}</span>`
      + `<em>${count ? `${count} ${count > 1 ? "articles" : "article"}` : "Prochainement"}<b aria-hidden="true">→</b></em></a>`;
  }).join("");
  const body = sceneHtml(SCENE)
    + `<section class="home-section" aria-labelledby="rayons-title"><h2 id="rayons-title">Nos rayons</h2><div class="rayon-grid">${tiles}</div></section>`
    + (nouveautes.length ? `<section class="home-section" id="nouveautes" aria-labelledby="nouveautes-title"><h2 id="nouveautes-title">Nos nouveautés</h2><div class="product-grid">${nouveautes.map(ficheCard).join("")}</div></section>` : "")
    + '<section class="home-section home-on-request"><div><h2>Produits sur commande</h2><p>Des produits à consulter ici, mais non achetables directement en ligne.</p></div><a class="btn-voir" href="/sur-demande/">Voir la rubrique</a></section>'
    + '<section class="home-section home-promises"><p><strong>Retrait gratuit à l’élevage</strong> pour les articles de la boutique</p><p><strong>Tarif Famille Dynastie</strong> avec votre numéro de puce ou votre code Famille</p><p><strong>Paiement sécurisé</strong> en ligne</p></section>';
  return page({
    title: "Boutique de l'Élevage de la Dynastie d'Orkhan | Alimentation, sellerie, médailles et soins",
    description: "La boutique de l'Élevage de la Dynastie d'Orkhan : alimentation, sellerie, identification, jouets, accessoires, hygiène et soins pour votre chien. Retrait gratuit à l'élevage.",
    canonical: "/",
    hero: heroHtml("La boutique de l’élevage", "Les produits que nous utilisons et recommandons pour nos Cavaliers King Charles et nos Bullmastiffs."),
    body
  });
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
        ? sections.map(([label, items]) => `<h2 class="subcategory-title">${escapeHtml(label)}</h2><div class="product-grid">${items.map(ficheCard).join("")}</div>`).join("")
          + (others.length ? `<h2 class="subcategory-title">Autres articles</h2><div class="product-grid">${others.map(ficheCard).join("")}</div>` : "")
        : fiches.length ? `<div class="product-grid">${fiches.map(ficheCard).join("")}</div>` : "");
  }
  return page({
    title: `${rayon.label} | Boutique Dynastie d'Orkhan`,
    description: `Rayon ${rayon.label} de la boutique de l'Élevage de la Dynastie d'Orkhan : ${Object.values(rayon.subcategories).join(", ").toLocaleLowerCase("fr")}.`,
    canonical: `/rayons/${rayon.slug}/`,
    hero: heroHtml(rayon.label, Object.values(rayon.subcategories).join(" · "), true),
    body: `${rayonsNav(rayon.key)}<section class="rayon-listing" aria-label="Articles du rayon ${escapeHtml(rayon.label)}">${listing}</section>`
  });
}

function renderSurDemande(catalogue) {
  const fiches = catalogue.available ? buildFiches(catalogue.products).filter((fiche) => fiche.onRequest) : [];
  return page({
    title: "Produits sur commande | Boutique Dynastie d'Orkhan",
    description: "Produits sur commande de l'Élevage de la Dynastie d'Orkhan : à consulter en ligne, non achetables directement sur la boutique.",
    canonical: "/sur-demande/",
    hero: heroHtml("Produits sur commande", "Des produits à consulter ici, mais non achetables directement en ligne : contactez-nous pour en parler.", true),
    body: `${rayonsNav(null)}<section class="rayon-listing">${fiches.length ? `<div class="product-grid">${fiches.map(ficheCard).join("")}</div>` : '<p class="rayon-empty">Aucun produit sur commande pour le moment.</p>'}</section>`
  });
}

// C5 / CAT-02 : fiche détaillée. Le choix du format et l'ajout au panier n'existent qu'ici ; chaque format garde sa
// référence, son prix et son stock. Les données des formats sont transmises au script de la page en JSON.
function renderFiche(catalogue, slug) {
  if (!catalogue.available || typeof slug !== "string" || !FICHE_SLUG.test(slug)) return null;
  const fiche = findFiche(buildFiches(catalogue.products), slug);
  if (!fiche) return null;
  const rayon = rayonByKey(fiche.shelf);
  const selected = fiche.variants.find((variant) => variant.reference === slug) || fiche.variants.find((variant) => variant.state === "in_stock" || variant.state === "low_stock") || fiche.variants[0];
  const variants = fiche.variants.map((variant) => ({
    reference: variant.reference,
    label: variant.variantLabel || variant.name,
    price: money(variant.publicPriceCents),
    familyPrice: Number.isInteger(variant.familyPriceCents) ? money(variant.familyPriceCents) : null,
    state: variant.state,
    availability: AVAILABILITY_LABELS[variant.state],
    maxQuantity: variant.state === "in_stock" || variant.state === "low_stock" ? variant.maxOrderQuantity : 0
  }));
  const current = variants.find((variant) => variant.reference === selected.reference);
  const photos = fiche.photos;
  const gallery = photos.length
    ? `<div class="fiche-gallery">${photoHtml(photos[0], "fiche-photo", "eager").replace("<img", '<img data-fiche-photo')}${photos.length > 1 ? `<div class="fiche-thumbs">${photos.map((photo, index) => `<button type="button" data-photo="${escapeHtml(photo.url)}" data-alt="${escapeHtml(photo.altText)}"${index === 0 ? ' aria-current="true"' : ""}>${photoHtml(photo, "")}</button>`).join("")}</div>` : ""}</div>`
    : `<div class="fiche-gallery"><span class="product-tile-placeholder fiche-photo">Photo à venir</span></div>`;
  const choice = variants.length > 1
    ? `<fieldset class="fiche-variants"><legend>Format</legend>${variants.map((variant) => `<label><input type="radio" name="variant" value="${escapeHtml(variant.reference)}"${variant.reference === current.reference ? " checked" : ""}><span>${escapeHtml(variant.label)}</span><small>${variant.price}</small></label>`).join("")}</fieldset>`
    : "";
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
  AVAILABILITY_LABELS, PARCOURS, SCENE, buildFiches, descriptionHtml, escapeHtml, findFiche, ficheCard, money, rayonBySlug,
  renderAccueil, renderFiche, renderNotFound, renderRayon, renderSurDemande, sceneHtml, variantAvailability
};
