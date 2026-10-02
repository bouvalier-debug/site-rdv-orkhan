const engravingConfig = require("../data/red-dingo-engraving.json");
const { allowedRedDingoColours, buildCatalog, getProduct } = require("./_catalog");
const { availableShippingModes, calculateShipping, mondialRelayConfigured, shippingProfile } = require("./_shipping");

function validQuantity(value) {
  return Number.isInteger(value) && value >= 1 && value <= 20;
}

function engravingLimits(reference, size, config = engravingConfig) {
  const override = config.referenceOverrides && config.referenceOverrides[reference];
  return (override && override.sizes && override.sizes[size]) || config.sizes[size] || null;
}

function normalizeLines(value) {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((line) => typeof line === "string") ? value : null;
}

function validateEngraving(lines, limits, side) {
  if (lines === null) return { error: `invalid_${side}_engraving` };
  if (lines.length > limits.lineCharacterLimits.length) return { error: `${side}_too_many_lines` };
  for (let index = 0; index < lines.length; index += 1) {
    if ([...lines[index]].length > limits.lineCharacterLimits[index]) {
      return { error: `${side}_line_too_long`, line: index + 1 };
    }
  }
  return null;
}

function validateRedDingo(product, options = {}, config = engravingConfig) {
  const size = typeof options.size === "string" ? options.size.trim().toUpperCase() : "";
  const models = product.models;
  const permittedSizes = models.some((model) => model.smallOnly) ? ["S"] : ["S", "M", "L"];
  if (!permittedSizes.includes(size)) return { error: "red_dingo_size_not_allowed" };

  const allowedColours = allowedRedDingoColours(models);
  const colour = typeof options.colour === "string" ? options.colour.trim() :
    typeof options.color === "string" ? options.color.trim() : "";
  if (allowedColours.length && !allowedColours.includes(colour)) return { error: "red_dingo_invalid_colour" };
  if (!allowedColours.length && colour) return { error: "red_dingo_invalid_colour" };

  const frontLines = normalizeLines(options.frontLines ?? options.recto);
  const backLines = normalizeLines(options.backLines ?? options.verso);
  const supportsBack = models.some((model) => model.doubleSided);
  if (backLines && backLines.some((line) => line.length) && !supportsBack) {
    return { error: "red_dingo_back_not_allowed" };
  }
  const limits = engravingLimits(product.reference, size, config);
  if (!limits) return { error: "red_dingo_engraving_limits_missing" };
  const frontError = validateEngraving(frontLines, limits, "front");
  if (frontError) return frontError;
  const backError = validateEngraving(backLines, limits, "back");
  if (backError) return backError;
  return { size, colour, frontLines, backLines };
}

function validateCart(input, options = {}) {
  if (!input || !Array.isArray(input.items) || input.items.length === 0) return { error: "invalid_cart" };
  const catalog = options.catalog || buildCatalog();
  const lines = [];
  const quantitiesByProduct = new Map();
  for (const item of input.items) {
    if (!item || typeof item.productId !== "string") return { error: "invalid_line" };
    if (!validQuantity(item.quantity)) return { error: "invalid_quantity" };
    const combinedQuantity = (quantitiesByProduct.get(item.productId) || 0) + item.quantity;
    if (!validQuantity(combinedQuantity)) return { error: "invalid_quantity" };
    quantitiesByProduct.set(item.productId, combinedQuantity);
    const product = getProduct(item.productId, catalog);
    if (!product) return { error: "unknown_product" };
    if (product.family === "croquettes") return { error: "kibble_not_available_v1" };

    let unitPriceCents = product.priceCents;
    let validatedOptions;
    if (product.family === "animoco") {
      unitPriceCents = input.benefits && input.benefits.dynastieFamily
        ? product.familyPriceCents : product.publicPriceCents;
    }
    if (product.family === "red-dingo") {
      validatedOptions = validateRedDingo(product, item.options, options.engravingConfig);
      if (validatedOptions.error) return validatedOptions;
    }
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) return { error: "catalog_price_missing" };
    lines.push({
      productId: product.id,
      name: product.name,
      family: product.family,
      quantity: item.quantity,
      unitPriceCents,
      subtotalCents: unitPriceCents * item.quantity,
      weightGrams: product.weightGrams,
      ...(validatedOptions ? { options: validatedOptions } : {})
    });
  }
  return { lines };
}

function quoteCart(input, options = {}) {
  const validated = validateCart(input, options);
  if (validated.error) return validated;
  const profile = shippingProfile(validated.lines);
  const shippingConfig = options.shippingConfig;
  const availableModes = availableShippingModes(profile, shippingConfig);
  const shippingStatus = profile.kind === "parcel" && !mondialRelayConfigured(profile, shippingConfig)
    ? "shipping_unavailable" : "available";
  const subtotalCents = validated.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const base = {
    currency: "EUR",
    lines: validated.lines,
    subtotalCents,
    shippingProfile: profile,
    availableShippingModes: availableModes,
    shippingStatus,
    benefits: { dynastieFamily: Boolean(input.benefits && input.benefits.dynastieFamily) }
  };
  if (!input.shipping) return { quote: { ...base, shipping: null, totalCents: null } };
  const shipping = calculateShipping(profile, input.shipping, options.shippingConfig);
  if (shipping.error) return shipping;
  return { quote: { ...base, shipping, totalCents: subtotalCents + shipping.priceCents } };
}

module.exports = {
  engravingLimits,
  quoteCart,
  validQuantity,
  validateCart,
  validateEngraving,
  validateRedDingo
};
