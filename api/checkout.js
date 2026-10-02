const { executeCheckout, requestOrigin } = require("./_checkout");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  try {
    const result = await executeCheckout(req.body, { origin: requestOrigin(req) });
    if (result.error) return send(res, result.status || 400, { error: result.error });
    return send(res, 200, result);
  } catch {
    return send(res, 502, { error: "checkout_unavailable" });
  }
};
