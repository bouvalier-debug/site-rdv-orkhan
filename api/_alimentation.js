"use strict";

// Rayon Alimentation : rubriques Croquettes / Friandises et cartes par marque. Aucune donnée n'est dupliquée : une carte
// (administrée dans Orkhan Manager) se rattache aux fiches du catalogue par leur marque. Ce module est sans dépendance
// vers le rendu HTML (api/_vitrine.js).

const RUBRIQUES = Object.freeze({
  croquettes: Object.freeze({ key: "croquettes", label: "Croquettes", all: "Toutes les croquettes", flag: "croquettes" }),
  friandises: Object.freeze({ key: "friandises", label: "Friandises", all: "Toutes les friandises", flag: "friandises" })
});

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Même règle que le Manager (brandKey) : sans accents ni casse, espaces réduits.
function brandKey(value) {
  return String(value || "").replace(/\s+/g, " ").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function brandSlug(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function rubriqueByKey(key) {
  return Object.prototype.hasOwnProperty.call(RUBRIQUES, key) ? RUBRIQUES[key] : null;
}

function fichesOf(fiches, rubrique) {
  return fiches.filter((fiche) => fiche.shelf === "ALIMENTATION" && fiche.subcategory === rubrique.key && !fiche.showcase);
}

function brandOf(fiche) {
  return fiche.recipe && fiche.recipe.brand ? brandKey(fiche.recipe.brand) : "";
}

// Cartes du Manager si elles sont transmises (tableau, même vide) ; sinon (Manager antérieur ou table absente) une carte
// automatique par marque présente dans le catalogue, par ordre alphabétique.
function sourceCards(fiches, brandCards) {
  if (Array.isArray(brandCards)) return brandCards;
  const brands = new Map();
  for (const fiche of fiches) if (fiche.recipe && fiche.recipe.brand && !brands.has(brandKey(fiche.recipe.brand))) brands.set(brandKey(fiche.recipe.brand), fiche.recipe.brand);
  return [...brands.values()].sort((a, b) => a.localeCompare(b, "fr"))
    .map((brand, index) => ({ slug: brandSlug(brand), name: brand, brand, croquettes: true, friandises: true, displayOrder: index, photo: null }));
}

// Cartes à afficher dans une rubrique : associées à la rubrique, avec au moins une fiche visible ; le visuel choisi dans le
// Manager prime, sinon la première photo d'une fiche de la marque.
function cardsFor(rubrique, fiches, brandCards) {
  const inRubrique = fichesOf(fiches, rubrique);
  return sourceCards(inRubrique, brandCards)
    .filter((card) => card && SLUG.test(card.slug || "") && card[rubrique.flag] === true)
    .map((card) => {
      const items = inRubrique.filter((fiche) => brandOf(fiche) === brandKey(card.brand));
      const photo = card.photo || (items.find((fiche) => fiche.photos.length) || { photos: [] }).photos[0] || null;
      return { slug: card.slug, name: card.name, brand: card.brand, count: items.length, photo, order: card.displayOrder };
    })
    .filter((card) => card.count > 0)
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, "fr"));
}

// Fiches d'une marque dans une rubrique, d'après la carte (affichée ou non : une carte masquée ne cache aucun produit,
// mais n'a plus de page propre).
function fichesForCard(rubrique, fiches, card) {
  return fichesOf(fiches, rubrique).filter((fiche) => brandOf(fiche) === brandKey(card.brand));
}

module.exports = { RUBRIQUES, brandKey, brandSlug, cardsFor, fichesForCard, fichesOf, rubriqueByKey };
