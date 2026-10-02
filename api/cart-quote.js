const { quoteCart } = require("./_cart");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

module.exports = (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const result = quoteCart(req.body);
  if (result.error) return send(res, result.error === "shipping_unavailable" ? 503 : 400, result);
  return send(res, 200, result);
};
