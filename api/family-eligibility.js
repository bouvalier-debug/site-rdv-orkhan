const { clientIp, consumeRequest, verifyFamilyChip, verifyFamilyCode } = require("./_family-eligibility");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function sendInvalidChip(res) {
  const body = JSON.stringify({ recognized: false, error: "invalid_chip" });
  res.statusCode = 400;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  return res.end(body);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  if (!consumeRequest(clientIp(req))) return send(res, 429, { error: "rate_limited" });

  // Un code Famille (DYN-XXXX-XXXX) ou un numéro de puce : même vérification que le panier, jamais les deux à la fois.
  const result = typeof req.body?.familyCode === "string" && req.body.chipNumber === undefined
    ? await verifyFamilyCode(req.body.familyCode)
    : await verifyFamilyChip(req.body?.chipNumber);
  if (result.status === "invalid") return sendInvalidChip(res);
  if (result.status === "unavailable") return send(res, 503, { recognized: false, error: "service_unavailable" });
  return send(res, 200, { recognized: result.recognized });
};
