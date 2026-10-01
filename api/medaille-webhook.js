const { clientIp, consumeRequest, verifyFamilyChip } = require("./_family-eligibility");
const { calculateShopOrder } = require("./_shop-order");

const URL = process.env.ORKHAN_MANAGER_MEDAILLE_WEBHOOK_URL || "https://orkhan-manager.vercel.app/api/medaille-webhook";
async function buildConnectedMedalPayload(body, options = {}) {
  const safeBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  let familyEligible = false;
  if (typeof safeBody.chipNumber === "string" && safeBody.chipNumber.trim()) {
    const verification = await verifyFamilyChip(safeBody.chipNumber, options);
    if (verification.status === "invalid") return { error: "invalid_chip" };
    if (verification.status === "unavailable") return { error: "family_service_unavailable" };
    familyEligible = verification.recognized;
  }

  const calculated = calculateShopOrder({
    productId: "animoco",
    quantity: safeBody.quantite,
    delivery: safeBody.livraison,
    benefits: { dynastieFamily: familyEligible }
  });
  if (calculated.error) return calculated;
  const { chipNumber: _chipNumber, famille_dynastie: _claim, pricing: _pricing, ...forwarded } = safeBody;
  return {
    payload: {
      type: "medaille-connectee",
      ...forwarded,
      familyEligible,
      pricing: calculated.order
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = process.env.RDV_WEBHOOK_TOKEN;
  if (!token) return res.status(500).json({ ok: false });
  if (req.body?.type === "medaille-connectee" && req.body?.chipNumber && !consumeRequest(clientIp(req))) {
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }
  const built = req.body?.type === "medaille-connectee"
    ? await buildConnectedMedalPayload(req.body)
    : { payload: { type: "medaille", ...(req.body || {}) } };
  if (built.error) {
    const status = built.error === "family_service_unavailable" ? 503 : 400;
    return res.status(status).json({ ok: false, error: built.error });
  }
  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rdv-token": token },
      body: JSON.stringify(built.payload)
    });
    return res.status(response.ok ? 200 : 502).json({ ok: response.ok });
  } catch {
    return res.status(502).json({ ok: false });
  }
};

module.exports.buildConnectedMedalPayload = buildConnectedMedalPayload;
