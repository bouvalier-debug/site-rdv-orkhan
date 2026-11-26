const { createManagerClient } = require("./_orkhan-shop-orders");

// Étape 2 : prix public unique, offres « X achetés + Y offerts » et avantage Famille global.
// Le calcul commercial est celui d'Orkhan Manager (POST /api/shop-catalog/pricing) : la Boutique ne le refait jamais.
// Ordre : prix publics → offres en cours → sous-total après offres → avantage Famille (taux enregistré, une seule
// ligne) → livraison, jamais remisée. La répartition par ligne reste interne au Manager : elle n'est pas renvoyée au
// navigateur.

const PRICING_VERSION = 2;
const MANAGER_PRICING_REFUSALS = {
  UNKNOWN_PRODUCT: { error: "unknown_product", status: 400 },
  PRODUCT_NOT_PURCHASABLE: { error: "product_not_purchasable", status: 409 }
};

const isCents = (value) => Number.isSafeInteger(value) && value >= 0;

// Panier sans produit du catalogue et sans Famille reconnue : aucune offre ni remise possible, pas d'appel au Manager
// (les paniers historiques gardent leur indépendance vis-à-vis du Manager pour le devis).
function needsManagerPricing(lines, familyEligible) {
  return familyEligible || lines.some((line) => line.family === "catalogue");
}

function noDiscountPricing(subtotalCents) {
  return { offers: [], offersDiscountCents: 0, subtotalAfterOffersCents: subtotalCents, family: null, discountCents: 0, netSubtotalCents: subtotalCents };
}

// Ne garde que ce que le panier affiche ; tout écart de cohérence est traité comme une indisponibilité.
function publicPricing(raw, subtotalCents) {
  const pricing = raw?.pricing;
  if (!pricing || typeof pricing !== "object" || pricing.version !== PRICING_VERSION) return null;
  if (![pricing.itemsSubtotalCents, pricing.offersDiscountCents, pricing.subtotalAfterOffersCents, pricing.discountCents, pricing.netSubtotalCents].every(isCents)) return null;
  // Prix public différent entre le catalogue lu par la Boutique et le Manager : le panier doit être recalculé.
  if (pricing.itemsSubtotalCents !== subtotalCents) return { priceChanged: true };
  const offers = (Array.isArray(pricing.offers) ? pricing.offers : []).map((offer) => ({
    offerId: String(offer?.offerId || ""),
    name: typeof offer?.name === "string" ? offer.name.slice(0, 120) : "",
    buyQuantity: offer?.buyQuantity,
    freeQuantity: offer?.freeQuantity,
    eligibleQuantity: offer?.eligibleQuantity,
    freeItems: offer?.freeItems,
    discountCents: offer?.discountCents,
    missingForNextFree: offer?.missingForNextFree
  }));
  if (offers.some((offer) => !offer.offerId || !offer.name || ![offer.buyQuantity, offer.freeQuantity, offer.eligibleQuantity, offer.freeItems, offer.discountCents, offer.missingForNextFree].every(isCents))) return null;
  const family = pricing.family && isCents(pricing.family.basisPoints) && isCents(pricing.family.discountCents)
    ? { basisPoints: pricing.family.basisPoints, discountCents: pricing.family.discountCents } : null;
  if (pricing.family && !family) return null;
  const offersDiscountCents = offers.reduce((sum, offer) => sum + offer.discountCents, 0);
  if (offersDiscountCents !== pricing.offersDiscountCents
    || pricing.subtotalAfterOffersCents !== subtotalCents - offersDiscountCents
    || pricing.discountCents !== offersDiscountCents + (family ? family.discountCents : 0)
    || pricing.netSubtotalCents !== subtotalCents - pricing.discountCents) return null;
  return {
    offers,
    offersDiscountCents,
    subtotalAfterOffersCents: pricing.subtotalAfterOffersCents,
    family,
    discountCents: pricing.discountCents,
    netSubtotalCents: pricing.netSubtotalCents
  };
}

// Complète un devis de la Boutique (lignes au prix public, livraison) avec le calcul commercial du Manager.
// Renvoie { quote } ou { error, status }.
async function applyCommercialPricing(quote, familyEligible, options = {}) {
  let pricing = noDiscountPricing(quote.subtotalCents);
  let familyDiscountBasisPoints = null;
  if (needsManagerPricing(quote.lines, familyEligible)) {
    let raw;
    try {
      const manager = options.manager || createManagerClient(options.managerOptions);
      raw = await manager.quotePricing({
        lines: quote.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })),
        dynastieFamilyEligible: familyEligible === true
      });
    } catch (error) {
      const refusal = MANAGER_PRICING_REFUSALS[error?.response?.error];
      if (refusal) return { ...refusal };
      console.error("Calcul commercial du Manager indisponible", error?.status || error?.name || "erreur");
      return { error: "pricing_unavailable", status: 503 };
    }
    const checked = publicPricing(raw, quote.subtotalCents);
    if (!checked) return { error: "pricing_unavailable", status: 503 };
    if (checked.priceChanged) return { error: "price_changed", status: 409 };
    pricing = checked;
    familyDiscountBasisPoints = isCents(raw.familyDiscountBasisPoints) ? raw.familyDiscountBasisPoints : null;
  }
  const shippingCents = quote.shipping ? quote.shipping.priceCents : null;
  return {
    quote: {
      ...quote,
      pricingVersion: PRICING_VERSION,
      pricing,
      ...(familyDiscountBasisPoints !== null ? { familyDiscountBasisPoints } : {}),
      discountCents: pricing.discountCents,
      totalCents: Number.isInteger(shippingCents) ? pricing.netSubtotalCents + shippingCents : null
    }
  };
}

module.exports = { PRICING_VERSION, applyCommercialPricing, needsManagerPricing, publicPricing };
