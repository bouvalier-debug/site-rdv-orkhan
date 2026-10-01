const PRODUCT_RULES = Object.freeze({
  animoco: Object.freeze({
    publicUnitPriceCents: 1999,
    familyUnitPriceCents: 1799,
    shippingCents: Object.freeze({ retrait: 0, france: 350, belgique: 490 })
  })
});

function validQuantity(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : null;
}

function calculateShopOrder({ productId, quantity, delivery, benefits = {} }) {
  const rules = PRODUCT_RULES[productId];
  const qty = validQuantity(quantity);
  if (!rules) return { error: "unknown_product" };
  if (!qty) return { error: "invalid_quantity" };
  const shippingCents = Object.prototype.hasOwnProperty.call(rules.shippingCents, delivery)
    ? rules.shippingCents[delivery]
    : null;
  if (shippingCents === null && delivery !== "autre") return { error: "invalid_delivery" };
  const unitPriceCents = benefits.dynastieFamily
    ? rules.familyUnitPriceCents
    : rules.publicUnitPriceCents;
  const subtotalCents = unitPriceCents * qty;
  return {
    order: {
      currency: "EUR",
      productId,
      unitPriceCents,
      quantity: qty,
      subtotalCents,
      shippingCents,
      totalCents: shippingCents === null ? null : subtotalCents + shippingCents,
      immediateCheckoutAvailable: shippingCents !== null,
      benefits: { dynastieFamily: Boolean(benefits.dynastieFamily) }
    }
  };
}

module.exports = { calculateShopOrder };
