const { processCheckoutCancel } = require("./_checkout-cancel");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

// Annulation du paiement par le client : voir api/_checkout-cancel.js.
async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await processCheckoutCancel({ order: body.order, cancel: body.cancel });
    return send(res, result.status, result.body);
  } catch (error) {
    console.error("checkout_cancel_unavailable", JSON.stringify({ step: error?.message || "unknown", status: error?.status ?? null }));
    return send(res, 503, { error: "checkout_cancel_unavailable" });
  }
}

module.exports = handler;
