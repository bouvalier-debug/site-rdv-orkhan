const { processPaymentWebhook, readRawBody } = require("./_payment-webhook");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const signature = req.headers?.["stripe-signature"];
  if (!signature) return send(res, 400, { error: "missing_signature" });
  try {
    const rawBody = await readRawBody(req);
    const result = await processPaymentWebhook(rawBody, signature);
    return send(res, result.status, result.body);
  } catch {
    return send(res, 503, { error: "webhook_processing_failed" });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
