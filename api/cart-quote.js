const { quoteCart } = require("./_cart");
const { CATALOG_CONFIG, buildCatalog, getProduct } = require("./_catalog");
const { cartCatalog } = require("./_cart-catalogue");
const { applyCommercialPricing } = require("./_cart-pricing");
const { chipNumbers, familyCodeInput, resolveFamilyEligibility } = require("./_family-benefit");
const { clientIp, consumeRequest } = require("./_family-eligibility");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function displayVariantName(product) {
  const normalize = (value) => value.trim().replace(/(\d)\s*(kg|g|ml|cl|l)\b/gi, "$1 $2");
  const values = Array.isArray(product.variantOptions) && product.variantOptions.length
    ? product.variantOptions.map((option) => option.value)
    : product.variantLabel?.split(/\s*·\s*/) || [];
  const missing = values.map(normalize).filter((value) => {
    if (!value) return false;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(normalize(product.name));
  });
  return missing.length ? `${product.name} – ${missing.join(" · ")}` : product.name;
}

// Affichage du panier : miniature (photo réelle de la référence choisie) et lien vers sa fiche. Données d'affichage
// seulement : ni la commande, ni Stripe, ni le Manager ne les reçoivent (le paiement recalcule son propre devis).
const ANIMOCO_DISPLAY = { photo: { url: "/medailles-connectees/assets/medaille-animoco-recto-verso.webp", altText: CATALOG_CONFIG.animoco.name }, href: "/medailles-connectees/" };

function lineDisplay(line, catalog) {
  if (line.productId === "animoco") return ANIMOCO_DISPLAY;
  const product = getProduct(line.productId, catalog || buildCatalog());
  if (!product) return {};
  if (product.catalogue) {
    return { ...(product.photo ? { photo: product.photo } : {}), href: `/produits/${encodeURIComponent(product.id)}/` };
  }
  if (product.family === "red-dingo") {
    const colour = line.options && line.options.colour;
    const model = product.models.find((candidate) => candidate.image && candidate.color === colour) || product.models.find((candidate) => candidate.image);
    return { ...(model ? { photo: { url: `/medailles-gravees/${model.image}`, altText: product.name } } : {}), href: "/medailles-gravees/" };
  }
  return {};
}

async function quoteCartRequest(input, options = {}) {
  const eligibility = await resolveFamilyEligibility(input?.items, { ...options, familyChipNumber: input?.familyChipNumber, familyCode: input?.familyCode });
  if (eligibility.error) return eligibility;
  const catalogue = await (options.cartCatalog || cartCatalog)(input?.items, options);
  if (catalogue.error) return catalogue;
  const result = (options.quoteCart || quoteCart)({
    items: catalogue.items || input?.items,
    shipping: input?.shipping,
    benefits: { dynastieFamily: eligibility.familyEligible }
  }, { ...options.quoteOptions, ...(catalogue.catalog ? { catalog: catalogue.catalog } : {}) });
  if (!result.quote) return result;
  // Étape 2 : offres en cours et avantage Famille global, calculés par le Manager.
  const priced = await (options.applyCommercialPricing || applyCommercialPricing)(result.quote, eligibility.familyEligible, options);
  if (priced.error) return priced;
  return { ...result, quote: { ...priced.quote, lines: priced.quote.lines.map((line) => {
    const display = lineDisplay(line, catalogue.catalog);
    const product = catalogue.catalog && catalogue.catalog.get(line.productId);
    const displayName = product?.variantGroup ? displayVariantName(product) : line.name;
    return { ...line, ...(displayName !== line.name ? { displayName } : {}), ...display };
  }) } };
}

async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const familyProof = chipNumbers(req.body?.items, req.body?.familyChipNumber).length || familyCodeInput(req.body?.familyCode);
  if (familyProof && !consumeRequest(clientIp(req))) {
    return send(res, 429, { error: "rate_limited" });
  }
  const result = await quoteCartRequest(req.body);
  if (result.error) return send(res, result.status || (result.error === "shipping_unavailable" ? 503 : result.error === "out_of_stock" || result.error === "product_not_purchasable" ? 409 : 400), result);
  return send(res, 200, result);
}

module.exports = handler;
module.exports.quoteCartRequest = quoteCartRequest;
