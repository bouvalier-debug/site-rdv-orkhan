const { executeCheckout, requestOrigin } = require("./_checkout");

const CHECKOUT_MARKER_COOKIE = "orkhan_checkout";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function checkoutMarkerCookie(reference) {
  return `${CHECKOUT_MARKER_COOKIE}=${encodeURIComponent(reference)}; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  try {
    const result = await executeCheckout(req.body, { origin: requestOrigin(req) });
    if (result.error) return send(res, result.status || 400, { error: result.error });
    if (result.orderReference) res.setHeader("Set-Cookie", checkoutMarkerCookie(result.orderReference));
    return send(res, 200, result);
  } catch (error) {
    console.error("checkout_unavailable", JSON.stringify({ step: error?.message || "unknown", status: error?.status ?? null, stripe: error?.stripeCode ?? null }));
    return send(res, 502, { error: "checkout_unavailable" });
  }
}

module.exports = handler;
module.exports.CHECKOUT_MARKER_COOKIE = CHECKOUT_MARKER_COOKIE;
module.exports.checkoutMarkerCookie = checkoutMarkerCookie;
