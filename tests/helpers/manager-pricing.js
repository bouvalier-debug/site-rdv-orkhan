// Banc d'essai : réplique fidèle, en JavaScript, de computeShopPricing et familyDiscountCents d'Orkhan Manager
// (src/lib/shop-pricing.ts, commit 068f8be, en Production). Sert UNIQUEMENT aux tests de la Boutique, pour simuler la
// route POST /api/shop-catalog/pricing ; la Boutique elle-même ne calcule jamais les remises.

function familyDiscountCents(baseCents, basisPoints) {
  return Math.floor((baseCents * basisPoints + 5000) / 10000);
}

function allocateProportionally(amountCents, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (amountCents === 0 || total === 0) return weights.map(() => 0);
  const shares = weights.map((weight, index) => ({ index, floor: Math.floor((weight * amountCents) / total), rest: (weight * amountCents) % total }));
  let remaining = amountCents - shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of [...shares].sort((left, right) => (right.rest - left.rest) || (left.index - right.index))) {
    if (remaining <= 0) break;
    share.floor += 1;
    remaining -= 1;
  }
  return shares.map((share) => share.floor);
}

function computeShopPricing(lines, offers, options) {
  const priced = lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents, grossCents: line.unitPriceCents * line.quantity, offerId: null, freeQuantity: 0, offerDiscountCents: 0, familyDiscountCents: 0, netCents: line.unitPriceCents * line.quantity }));
  const applied = [];
  for (const offer of offers) {
    const ids = new Set(offer.productIds);
    const members = priced.map((line, index) => ({ line, index })).filter(({ line }) => line.offerId === null && ids.has(line.productId));
    if (!members.length) continue;
    for (const { line } of members) line.offerId = offer.id;
    const units = members.flatMap(({ line, index }) => Array.from({ length: line.quantity }, () => ({ index, price: line.unitPriceCents })))
      .sort((left, right) => (right.price - left.price) || (left.index - right.index));
    const size = offer.buyQuantity + offer.freeQuantity;
    const groups = Math.floor(units.length / size);
    let discount = 0;
    for (let group = 0; group < groups; group += 1) {
      for (let position = group * size + offer.buyQuantity; position < (group + 1) * size; position += 1) {
        const unit = units[position];
        priced[unit.index].freeQuantity += 1;
        priced[unit.index].offerDiscountCents += unit.price;
        discount += unit.price;
      }
    }
    const rest = units.length % size;
    applied.push({ offerId: offer.id, name: offer.name, buyQuantity: offer.buyQuantity, freeQuantity: offer.freeQuantity, eligibleQuantity: units.length, freeItems: groups * offer.freeQuantity, discountCents: discount, missingForNextFree: rest === 0 ? 0 : size - rest });
  }
  const itemsSubtotalCents = priced.reduce((sum, line) => sum + line.grossCents, 0);
  const offersDiscountCents = applied.reduce((sum, offer) => sum + offer.discountCents, 0);
  const subtotalAfterOffersCents = itemsSubtotalCents - offersDiscountCents;
  const afterOffers = priced.map((line) => line.grossCents - line.offerDiscountCents);
  const family = options.familyEligible && options.familyDiscountBasisPoints > 0
    ? { basisPoints: options.familyDiscountBasisPoints, discountCents: familyDiscountCents(subtotalAfterOffersCents, options.familyDiscountBasisPoints) } : null;
  const shares = allocateProportionally(family?.discountCents ?? 0, afterOffers);
  priced.forEach((line, index) => { line.familyDiscountCents = shares[index]; line.netCents = afterOffers[index] - shares[index]; });
  const discountCents = offersDiscountCents + (family?.discountCents ?? 0);
  return { version: 2, itemsSubtotalCents, offers: applied, offersDiscountCents, subtotalAfterOffersCents, family, discountCents, netSubtotalCents: itemsSubtotalCents - discountCents, lines: priced };
}

const isLegacy = (productId) => productId === "animoco" || /^(cosmetics|red-dingo):./.test(productId);

// Faux Manager : quotePricing reproduit la route de devis (prix publics du catalogue pour les références, prix transmis
// pour les articles historiques), avec un taux Famille et des offres en cours fournis par le test.
function fakePricingManager({ basisPoints = 500, offers = [], prices = {}, calls = [], fail = null } = {}) {
  return {
    async quotePricing(payload) {
      calls.push(["quotePricing", payload]);
      if (fail) throw fail;
      const lines = payload.lines.map((line) => ({
        productId: line.productId, quantity: line.quantity,
        unitPriceCents: isLegacy(line.productId) || prices[line.productId] === undefined ? line.unitPriceCents : prices[line.productId]
      }));
      return { ok: true, familyDiscountBasisPoints: basisPoints, pricing: computeShopPricing(lines, offers, { familyEligible: payload.dynastieFamilyEligible === true, familyDiscountBasisPoints: basisPoints }) };
    }
  };
}

module.exports = { computeShopPricing, fakePricingManager, familyDiscountCents };
