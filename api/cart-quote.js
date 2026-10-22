const { quoteCart } = require("./_cart");
const { cartCatalog } = require("./_cart-catalogue");
const { chipNumbers, familyCodeInput, resolveFamilyEligibility } = require("./_family-benefit");
const { clientIp, consumeRequest } = require("./_family-eligibility");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function quoteCartRequest(input, options = {}) {
  const eligibility = await resolveFamilyEligibility(input?.items, { ...options, familyChipNumber: input?.familyChipNumber, familyCode: input?.familyCode });
  if (eligibility.error) return eligibility;
  const catalogue = await (options.cartCatalog || cartCatalog)(input?.items, options);
  if (catalogue.error) return catalogue;
  return (options.quoteCart || quoteCart)({
    items: catalogue.items || input?.items,
    shipping: input?.shipping,
    benefits: { dynastieFamily: eligibility.familyEligible }
  }, { ...options.quoteOptions, ...(catalogue.catalog ? { catalog: catalogue.catalog } : {}) });
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
