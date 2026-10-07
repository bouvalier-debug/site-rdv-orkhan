const { verifyFamilyChip } = require("./_family-eligibility");

function cleanString(value, maximum = 32) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function chipNumbers(items) {
  return [...new Set((Array.isArray(items) ? items : [])
    .filter((item) => item?.productId === "animoco")
    .map((item) => cleanString(item?.options?.chipNumber))
    .filter(Boolean))];
}

async function resolveFamilyEligibility(items, options = {}) {
  const chips = chipNumbers(items);
  if (chips.length > 1) return { error: "multiple_family_chips", status: 400 };
  if (chips.length === 0) return { familyEligible: false };
  const verification = await (options.verifyFamilyChip || verifyFamilyChip)(chips[0], options.familyOptions);
  if (verification.status === "invalid") return { error: "invalid_chip", status: 400 };
  if (verification.status !== "ok") return { error: "family_verification_unavailable", status: 503 };
  return { familyEligible: verification.recognized === true };
}

module.exports = { chipNumbers, resolveFamilyEligibility };
