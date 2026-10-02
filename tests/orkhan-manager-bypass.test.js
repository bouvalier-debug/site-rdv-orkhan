const test = require("node:test");
const assert = require("node:assert/strict");
const { createManagerClient } = require("../api/_orkhan-shop-orders");

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174000";

test("le client Manager envoie le bypass Vercel Preview quand il est configuré", async () => {
  let request;
  const manager = createManagerClient({
    baseUrl: "https://manager-preview.example",
    secret: "shop-secret",
    vercelBypassSecret: "preview-bypass",
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ reference: "BOUT-TEST" }) };
    }
  });

  await manager.createOrder({ totalCents: 2349 }, ATTEMPT);

  assert.equal(request.options.headers["X-Orkhan-Shop-Orders-Secret"], "shop-secret");
  assert.equal(request.options.headers["x-vercel-protection-bypass"], "preview-bypass");
  assert.equal(request.options.headers["Idempotency-Key"], ATTEMPT);
});
