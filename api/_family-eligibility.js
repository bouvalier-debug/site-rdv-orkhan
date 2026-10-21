const EXPECTED_CHIP_DIGITS = 15;
const REQUEST_TIMEOUT_MS = 5000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

// This lightweight limit is local to one function instance. The server-only
// shared secret remains the primary protection of the upstream API.
const requestBuckets = new Map();

function normalizeChipNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[^\d\s.-]/.test(trimmed)) return null;
  const normalized = trimmed.replace(/[\s.-]/g, "");
  return normalized.length === EXPECTED_CHIP_DIGITS && /^\d+$/.test(normalized)
    ? normalized
    : null;
}

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

function consumeRequest(ip, now = Date.now()) {
  const current = requestBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

// Phase 5 : code temporaire Familles Dynastie (DYN-XXXX-XXXX, alphabet de Crockford). Même normalisation que le
// Manager : O lu comme 0, I et L lus comme 1 ; le préfixe DYN, les tirets et les espaces sont facultatifs.
const FAMILY_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

function normalizeFamilyCode(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  let compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (compact.startsWith("DYN")) compact = compact.slice(3);
  compact = compact.replace(/O/g, "0").replace(/[IL]/g, "1");
  return FAMILY_CODE_PATTERN.test(compact) ? compact : null;
}

function upstreamEndpoint(baseUrl, route = "verify-chip") {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/families/${route}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function verifyFamilyChip(chipNumber, options = {}) {
  const normalized = normalizeChipNumber(chipNumber);
  if (!normalized) return { status: "invalid", recognized: false };
  return askManager("verify-chip", { chipNumber: normalized }, options);
}

// Le code est vérifié par le Manager seul (empreinte côté serveur) ; seule l'éligibilité revient.
async function verifyFamilyCode(familyCode, options = {}) {
  const normalized = normalizeFamilyCode(familyCode);
  if (!normalized) return { status: "invalid", recognized: false };
  return askManager("verify-code", { familyCode: normalized }, options);
}

async function askManager(route, payload, options) {

  const managerUrl = options.managerUrl || process.env.ORKHAN_MANAGER_URL;
  const secret = options.secret || process.env.ORKHAN_FAMILY_API_SECRET;
  const vercelBypassSecret = options.vercelBypassSecret || process.env.ORKHAN_MANAGER_VERCEL_BYPASS_SECRET;
  if (!managerUrl || !secret) return { status: "unavailable", recognized: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetch || fetch)(upstreamEndpoint(managerUrl, route), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dynastie-family-token": secret,
        ...(vercelBypassSecret ? { "x-vercel-protection-bypass": vercelBypassSecret } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) return { status: "unavailable", recognized: false };
    const body = await response.json();
    if (!body || typeof body.recognized !== "boolean") {
      return { status: "unavailable", recognized: false };
    }
    return { status: "ok", recognized: body.recognized };
  } catch {
    return { status: "unavailable", recognized: false };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { clientIp, consumeRequest, normalizeChipNumber, normalizeFamilyCode, verifyFamilyChip, verifyFamilyCode };
