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

function upstreamEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/families/verify-chip`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function verifyFamilyChip(chipNumber, options = {}) {
  const normalized = normalizeChipNumber(chipNumber);
  if (!normalized) return { status: "invalid", recognized: false };

  const managerUrl = options.managerUrl || process.env.ORKHAN_MANAGER_URL;
  const secret = options.secret || process.env.ORKHAN_FAMILY_API_SECRET;
  const vercelBypassSecret = options.vercelBypassSecret || process.env.ORKHAN_MANAGER_VERCEL_BYPASS_SECRET;
  if (!managerUrl || !secret) return { status: "unavailable", recognized: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetch || fetch)(upstreamEndpoint(managerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dynastie-family-token": secret,
        ...(vercelBypassSecret ? { "x-vercel-protection-bypass": vercelBypassSecret } : {})
      },
      body: JSON.stringify({ chipNumber: normalized }),
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

module.exports = { clientIp, consumeRequest, normalizeChipNumber, verifyFamilyChip };
