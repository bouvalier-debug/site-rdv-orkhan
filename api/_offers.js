"use strict";

// Étape 2 : affichage commercial de l'avantage Famille et des offres « X achetés + Y offerts » administrés dans Orkhan
// Manager (catalogue.commercial). Aucun calcul de remise ici : le panier reçoit le calcul du Manager. Une offre
// désactivée ou terminée n'est plus publiée par le Manager et disparaît donc de tous ces affichages ; une offre dont la
// date de fin est passée est aussi écartée ici (page restée en cache).

const PARIS = "Europe/Paris";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function money(cents) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/ /g, " ");
}

// Taux de l'avantage Famille (points de base) : « 5 % », « 4,5 % » ; null si inconnu ou nul.
function familyRateText(basisPoints) {
  if (!Number.isSafeInteger(basisPoints) || basisPoints <= 0) return null;
  return `${(basisPoints / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

function familyRateOf(catalogue) {
  return familyRateText(catalogue && catalogue.commercial ? catalogue.commercial.familyDiscountBasisPoints : null);
}

function runningOffers(catalogue, now = Date.now()) {
  const offers = catalogue && catalogue.commercial && Array.isArray(catalogue.commercial.offers) ? catalogue.commercial.offers : [];
  return offers.filter((offer) => !offer.endsAt || Date.parse(offer.endsAt) > now);
}

// Même règle que le Manager : une référence ne relève que de la première offre qui la contient.
function offerForReference(offers, reference) {
  return offers.find((offer) => offer.productReferences.includes(reference)) || null;
}

// « 2 + 1 offert », « 3 + 2 offerts ».
function offerBadgeText(offer) {
  return `${offer.buyQuantity} + ${offer.freeQuantity} offert${offer.freeQuantity > 1 ? "s" : ""}`;
}

// La fin est enregistrée comme le lendemain 00:00 (Paris) du dernier jour inclus : on affiche ce dernier jour.
function endDateText(endsAt) {
  if (!endsAt) return null;
  const last = new Date(Date.parse(endsAt) - 1);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "long", year: "numeric" }).format(last)
    .replace(/^1 /, "1er ");
}

function validityText(offer) {
  const end = endDateText(offer.endsAt);
  return end ? `Offre valable jusqu’au ${end} inclus, dans la limite des stocks disponibles.` : "Dans la limite des stocks disponibles.";
}

// Prix du lot (publié par le Manager seulement si toutes les références de l'offre ont le même prix) et économie.
function lotFacts(offer) {
  if (!Number.isSafeInteger(offer.lotPriceCents) || offer.lotPriceCents <= 0) return null;
  const unitCents = offer.lotPriceCents / offer.buyQuantity;
  if (!Number.isSafeInteger(unitCents)) return null;
  return { lotPriceCents: offer.lotPriceCents, regularCents: unitCents * offer.lotQuantity, savingCents: unitCents * offer.freeQuantity };
}

const canMix = (offer) => offer.productReferences.length > 1;

// Pastille et mention des cartes produits : seulement si une variante en vente de la fiche relève d'une offre (une
// référence en rupture ne porte pas l'offre, les autres la gardent).
function tileOffer(fiche, offers) {
  if (fiche.showcase) return null;
  for (const variant of fiche.variants || []) {
    if (variant.state === "out_of_stock" || variant.state === "soon") continue;
    const offer = offerForReference(offers, variant.reference);
    if (offer) return offer;
  }
  return null;
}

function tileBadgeHtml(offer) {
  return offer ? `<span class="tile-offer">${offerBadgeText(offer)}</span>` : "";
}

function tileNoteHtml(offer) {
  return offer && canMix(offer) ? '<p class="tile-offer-note">Panachage possible</p>' : "";
}

// Encart de la fiche produit, un par offre présente parmi les variantes ; seul celui de la variante choisie est visible.
function ficheOfferHtml(offer, hidden) {
  const lot = lotFacts(offer);
  const buy = `${offer.buyQuantity} produit${offer.buyQuantity > 1 ? "s" : ""} acheté${offer.buyQuantity > 1 ? "s" : ""}`;
  const free = `${offer.freeQuantity} offert${offer.freeQuantity > 1 ? "s" : ""}`;
  return `<aside class="fiche-offer" data-fiche-offer="${escapeHtml(offer.id)}" aria-label="Offre en cours"${hidden ? " hidden" : ""}>`
    + `<p class="fiche-offer-head"><span class="fiche-offer-badge">${offerBadgeText(offer)}</span><strong>${escapeHtml(offer.name)}</strong></p>`
    + `<ul><li>${buy}, ${free}${lot ? ` : <strong>${money(lot.lotPriceCents)} les ${offer.lotQuantity}</strong> au lieu de ${money(lot.regularCents)}, soit ${money(lot.savingCents)} d’économie` : ""}.</li>`
    + (canMix(offer) ? `<li>Panachage possible entre les ${offer.productReferences.length} références de l’offre.</li>` : "")
    + `<li>${validityText(offer)}</li>`
    + "<li>La remise s’applique automatiquement dans le panier.</li></ul></aside>";
}

// Format (« 50 g », « 1,5 kg », « 100 ml ») lu à la fin du nom de l'offre, tel que saisi dans le Manager.
function offerFormat(offer) {
  const match = offer.name.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l)\s*$/i);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : null;
}

// Mention de panachage du bandeau. Plusieurs offres qui se distinguent chacune par un format (ex. SOOPA : 50 g et 100 g) :
// « Panachez librement les saveurs d'un même format (50 g ou 100 g). » ; sinon, formulation générale.
function mixText(offers) {
  if (offers.length === 1) return "Panachage possible entre les références de l’offre.";
  const formats = offers.map(offerFormat);
  if (formats.every(Boolean) && new Set(formats).size === formats.length) {
    const list = formats.length === 2 ? formats.join(" ou ") : `${formats.slice(0, -1).join(", ")} ou ${formats.at(-1)}`;
    return `Panachez librement les saveurs d’un même format (${list}).`;
  }
  return "Panachage possible entre les références d’une même offre.";
}

// Bandeau promotionnel (accueil, rayon Alimentation, page de marque). Les offres de même mécanique sont regroupées dans
// un seul bandeau, chacune sur sa ligne avec ses propres conditions : les règles de calcul ne sont jamais mélangées.
function offerBannerHtml(offers, { brand = null, href = null } = {}) {
  if (!offers.length) return "";
  const sameMechanic = offers.every((offer) => offer.buyQuantity === offers[0].buyQuantity && offer.freeQuantity === offers[0].freeQuantity);
  const title = sameMechanic
    ? `${offers[0].buyQuantity} achetés + ${offers[0].freeQuantity} offert${offers[0].freeQuantity > 1 ? "s" : ""}`.replace(/^1 achetés/, "1 acheté")
    : "Nos offres en cours";
  const sameEnd = offers.every((offer) => offer.endsAt === offers[0].endsAt);
  const rows = offers.map((offer) => {
    const lot = lotFacts(offer);
    return `<li><span class="offer-banner-name">${escapeHtml(offer.name)}</span>`
      + (sameMechanic ? "" : `<span class="offer-banner-badge">${offerBadgeText(offer)}</span>`)
      + (lot ? `<span class="offer-banner-price"><strong>${money(lot.lotPriceCents)} les ${offer.lotQuantity}</strong> au lieu de ${money(lot.regularCents)}</span>` : "")
      + (sameEnd ? "" : `<small>${escapeHtml(validityText(offer))}</small>`) + "</li>";
  }).join("");
  const mix = offers.some(canMix) ? `${mixText(offers)} ` : "";
  const notes = `${mix}${sameEnd ? validityText(offers[0]) : "Dans la limite des stocks disponibles."} La remise s’applique automatiquement dans le panier.`;
  return `<section class="offer-banner" aria-labelledby="offer-banner-title"><div class="offer-banner-copy"><p class="offer-banner-kicker">${brand ? `${escapeHtml(brand)} · ` : ""}Offre${offers.length > 1 ? "s" : ""} en cours</p>`
    + `<h2 id="offer-banner-title">${title}</h2><ul class="offer-banner-list">${rows}</ul><p class="offer-banner-note">${notes}</p></div>`
    + (href ? `<a class="btn-voir offer-banner-link" href="${escapeHtml(href)}">Voir les produits</a>` : "") + "</section>";
}

// Offres dont au moins une fiche visible figure parmi les fiches données.
function offersAmong(offers, fiches) {
  const references = new Set(fiches.filter((fiche) => !fiche.showcase).flatMap((fiche) => fiche.variants.map((variant) => variant.reference)));
  return offers.filter((offer) => offer.productReferences.some((reference) => references.has(reference)));
}

module.exports = {
  endDateText, familyRateOf, familyRateText, ficheOfferHtml, lotFacts, offerBadgeText, offerBannerHtml, offerForReference,
  offersAmong, runningOffers, tileBadgeHtml, tileNoteHtml, tileOffer, validityText
};
