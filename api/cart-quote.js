const { quoteCart } = require("./_cart");
const { chipNumbers, resolveFamilyEligibility } = require("./_family-benefit");
const { clientIp, consumeRequest } = require("./_family-eligibility");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function quoteCartRequest(input, options = {}) {
  const eligibility = await resolveFamilyEligibility(input?.items, options);
  if (eligibility.error) return eligibility;
  return (options.quoteCart || quoteCart)({
    items: input?.items,
    shipping: input?.shipping,
    benefits: { dynastieFamily: eligibility.familyEligible }
  }, options.quoteOptions);
}

async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  if (chipNumbers(req.body?.items).length && !consumeRequest(clientIp(req))) {
    return send(res, 429, { error: "rate_limited" });
  }
  const result = await quoteCartRequest(req.body);
  if (result.error) return send(res, result.status || (result.error === "shipping_unavailable" ? 503 : 400), result);
  return send(res, 200, result);
}

module.exports = handler;
module.exports.quoteCartRequest = quoteCartRequest;
