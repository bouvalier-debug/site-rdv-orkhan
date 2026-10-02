const STRIPE_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const ORDER_REFERENCE = /^BOUT-\d{4}-[A-Z0-9]{10}$/;

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function retrieveCheckoutSession(sessionId, options = {}) {
  const secretKey = options.secretKey || process.env.STRIPE_SECRET_KEY;
  const fetchImpl = options.fetch || fetch;
  if (!secretKey) throw new Error("stripe_not_configured");
  const response = await fetchImpl(`${options.apiUrl || STRIPE_SESSIONS_URL}/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = new Error("stripe_session_unavailable");
    error.status = response.status;
    throw error;
  }
  return body;
}

function confirmationSnapshot(session) {
  const reference = session?.client_reference_id;
  if (!ORDER_REFERENCE.test(reference || "") || session?.metadata?.orderReference !== reference) {
    return null;
  }
  return {
    ok: true,
    orderReference: reference,
    paymentStatus: session.payment_status === "paid" ? "paid" : "pending"
  };
}

async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
  const sessionId = typeof req.query?.session_id === "string" ? req.query.session_id : "";
  if (!SESSION_ID.test(sessionId)) return send(res, 400, { error: "invalid_session" });
  try {
    const session = await retrieveCheckoutSession(sessionId);
    const snapshot = confirmationSnapshot(session);
    if (!snapshot) return send(res, 404, { error: "confirmation_not_found" });
    return send(res, 200, snapshot);
  } catch (error) {
    if (error?.status === 404) return send(res, 404, { error: "confirmation_not_found" });
    return send(res, 503, { error: "confirmation_unavailable" });
  }
}

module.exports = handler;
module.exports.confirmationSnapshot = confirmationSnapshot;
module.exports.retrieveCheckoutSession = retrieveCheckoutSession;
