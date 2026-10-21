const { verifyFamilyChip, verifyFamilyCode } = require("./_family-eligibility");

function cleanString(value, maximum = 32) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

// Même numéro écrit avec ou sans espaces, points ou tirets : une seule puce.
function chipKey(value) {
  return cleanString(value).replace(/[\s.-]/g, "");
}

// Vérification Familles Dynastie unique, au niveau du panier commun (familyChipNumber), quels que soient les articles.
// Compatibilité : une puce encore rangée sur une ligne Animoco (paniers enregistrés avant ce changement) est reprise
// comme puce du panier. Deux puces différentes restent refusées : un panier correspond à une seule famille.
function chipNumbers(items, familyChipNumber) {
  const chips = new Map();
  const add = (value) => { const key = chipKey(value); if (key && !chips.has(key)) chips.set(key, cleanString(value)); };
  add(familyChipNumber);
  (Array.isArray(items) ? items : [])
    .filter((item) => item?.productId === "animoco")
    .forEach((item) => add(item?.options?.chipNumber));
  return [...chips.values()];
}

// Phase 5 (FAM-06) : une seule preuve par panier, le code Famille OU la puce, jamais les deux.
function familyCodeInput(value) {
  return cleanString(value, 40);
}

async function resolveFamilyEligibility(items, options = {}) {
  const chips = chipNumbers(items, options.familyChipNumber);
  const familyCode = familyCodeInput(options.familyCode);
  if (familyCode) {
    if (chips.length) return { error: "family_proof_conflict", status: 400 };
    const verification = await (options.verifyFamilyCode || verifyFamilyCode)(familyCode, options.familyOptions);
    if (verification.status === "invalid") return { error: "invalid_family_code", status: 400 };
    if (verification.status !== "ok") return { error: "family_verification_unavailable", status: 503 };
    return { familyEligible: verification.recognized === true };
  }
  if (chips.length > 1) return { error: "multiple_family_chips", status: 400 };
  if (chips.length === 0) return { familyEligible: false };
  const verification = await (options.verifyFamilyChip || verifyFamilyChip)(chips[0], options.familyOptions);
  if (verification.status === "invalid") return { error: "invalid_chip", status: 400 };
  if (verification.status !== "ok") return { error: "family_verification_unavailable", status: 503 };
  return { familyEligible: verification.recognized === true };
}

module.exports = { chipNumbers, familyCodeInput, resolveFamilyEligibility };
