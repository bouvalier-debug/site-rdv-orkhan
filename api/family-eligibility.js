const { clientIp, consumeRequest, verifyFamilyChip } = require("./_family-eligibility");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  if (!consumeRequest(clientIp(req))) return send(res, 429, { error: "rate_limited" });

  const result = await verifyFamilyChip(req.body?.chipNumber);
  if (result.status === "invalid") return send(res, 400, { recognized: false, error: "invalid_chip" });
  if (result.status === "unavailable") return send(res, 503, { recognized: false, error: "service_unavailable" });
  return send(res, 200, { recognized: result.recognized });
};
