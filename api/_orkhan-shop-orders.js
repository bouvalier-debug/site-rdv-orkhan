const REQUEST_TIMEOUT_MS = 8000;

function endpoint(baseUrl, pathname) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${pathname}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function createManagerClient(options = {}) {
  const baseUrl = options.baseUrl || process.env.ORKHAN_MANAGER_URL;
  const secret = options.secret || process.env.ORKHAN_SHOP_ORDERS_SECRET;
  const vercelBypassSecret = options.vercelBypassSecret || process.env.ORKHAN_MANAGER_VERCEL_BYPASS_SECRET;
  const fetchImpl = options.fetch || fetch;
  if (!baseUrl || !secret) throw new Error("orkhan_manager_not_configured");

  async function request(pathname, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint(baseUrl, pathname), {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Orkhan-Shop-Orders-Secret": secret,
          ...(vercelBypassSecret ? { "x-vercel-protection-bypass": vercelBypassSecret } : {}),
          ...init.headers
        },
        signal: controller.signal
      });
      let body;
      try { body = await response.json(); } catch { body = { error: "invalid_manager_response" }; }
      if (!response.ok) {
        const error = new Error(body.error || "orkhan_manager_error");
        error.status = response.status;
        error.response = body;
        throw error;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    createOrder(payload, idempotencyKey) {
      return request("/api/shop-orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload)
      });
    },
    attachPaymentReference(reference, payload) {
      return request(`/api/shop-orders/${encodeURIComponent(reference)}/payment-reference`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    },
    markPaid(reference, payload) {
      return request(`/api/shop-orders/${encodeURIComponent(reference)}/paid`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  };
}

module.exports = { createManagerClient, endpoint };
