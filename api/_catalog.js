const redDingoModels = require("../medailles-gravees/models.json");
const redDingoColours = require("../data/red-dingo-colours.json");

const PRODUCT_FAMILIES = Object.freeze(["animoco", "red-dingo", "colis", "croquettes"]);
const RED_DINGO_PRICE_CENTS = 1695;

// Product data still expected from David is deliberately null/empty here. A null
// weight prevents a made-up Mondial Relay quote from reaching a customer.
const CATALOG_CONFIG = Object.freeze({
  animoco: Object.freeze({
    id: "animoco",
    name: "Médaille connectée Animoco",
    family: "animoco",
    publicPriceCents: 1999,
    familyPriceCents: 1799,
    weightGrams: null
  }),
  parcelProducts: Object.freeze([
    Object.freeze({ id: "cosmetics:block", name: "Artero Block", family: "colis", priceCents: 2140, weightGrams: null }),
    Object.freeze({ id: "cosmetics:bye-bye", name: "Artero Bye Bye 300 ml", family: "colis", priceCents: 1995, weightGrams: null }),
    Object.freeze({ id: "cosmetics:samba", name: "Artero Samba", family: "colis", priceCents: 1145, weightGrams: null }),
    Object.freeze({ id: "cosmetics:dfender", name: "Artero Dfender", family: "colis", priceCents: 2265, weightGrams: null }),
    Object.freeze({ id: "cosmetics:pack-ete", name: "Pack Été complet", family: "colis", priceCents: 6995, weightGrams: null })
  ]),
  futureKibbleProducts: Object.freeze([])
});

function normalizeReference(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function modelsForReference(reference) {
  const normalized = normalizeReference(reference);
  return redDingoModels.filter((model) => normalizeReference(model.reference) === normalized);
}

function redDingoProduct(reference) {
  const models = modelsForReference(reference);
  if (!models.length) return null;
  const first = models[0];
  return {
    id: `red-dingo:${normalizeReference(first.reference)}`,
    name: first.name,
    family: "red-dingo",
    priceCents: RED_DINGO_PRICE_CENTS,
    weightGrams: 0,
    reference: normalizeReference(first.reference),
    models
  };
}

function buildCatalog(extraProducts = []) {
  const configured = [CATALOG_CONFIG.animoco, ...CATALOG_CONFIG.parcelProducts,
    ...CATALOG_CONFIG.futureKibbleProducts, ...extraProducts];
  return new Map(configured.map((product) => [product.id, product]));
}

function getProduct(productId, catalog = buildCatalog()) {
  if (catalog.has(productId)) return catalog.get(productId);
  if (typeof productId === "string" && productId.startsWith("red-dingo:")) {
    return redDingoProduct(productId.slice("red-dingo:".length));
  }
  return null;
}

function allowedRedDingoColours(models) {
  if (models.some((model) => model.elevenColours)) return redDingoColours.enamel;
  if (models.some((model) => model.glitterColours)) return redDingoColours.glitter;
  return [...new Set(models.map((model) => model.color).filter(Boolean))];
}

module.exports = {
  CATALOG_CONFIG,
  PRODUCT_FAMILIES,
  RED_DINGO_PRICE_CENTS,
  allowedRedDingoColours,
  buildCatalog,
  getProduct,
  modelsForReference,
  normalizeReference,
  redDingoModels,
  redDingoProduct
};
