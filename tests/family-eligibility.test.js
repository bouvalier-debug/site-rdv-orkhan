const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeChipNumber, verifyFamilyChip } = require("../api/_family-eligibility");
const handler = require("../api/family-eligibility");

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("normalise uniquement une puce de 15 chiffres avec séparateurs raisonnables", () => {
  assert.equal(normalizeChipNumber("250 12-345.6789012"), "250123456789012");
  assert.equal(normalizeChipNumber("25012345678901"), null);
  assert.equal(normalizeChipNumber("25012345678901A"), null);
});

test("relaie la puce avec le secret uniquement côté serveur", async () => {
  let request;
  const result = await verifyFamilyChip("250123456789012", {
    managerUrl: "https://manager.preview.test",
    secret: "preview-secret",
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ recognized: true }) };
    }
  });
  assert.deepEqual(result, { status: "ok", recognized: true });
  assert.equal(request.url, "https://manager.preview.test/api/families/verify-chip");
  assert.equal(request.options.headers["x-dynastie-family-token"], "preview-secret");
});

test("ne contacte pas Orkhan Manager pour un format invalide", async () => {
  let called = false;
  const result = await verifyFamilyChip("invalid", { fetch: async () => { called = true; } });
  assert.deepEqual(result, { status: "invalid", recognized: false });
  assert.equal(called, false);
});

test("distingue une indisponibilité amont", async () => {
  const result = await verifyFamilyChip("250123456789012", {
    managerUrl: "https://manager.preview.test",
    secret: "preview-secret",
    fetch: async () => { throw new Error("network"); }
  });
  assert.deepEqual(result, { status: "unavailable", recognized: false });
});

test("l’API navigateur reste minimale et sans cache", async () => {
  const previousUrl = process.env.ORKHAN_MANAGER_URL;
  const previousSecret = process.env.ORKHAN_FAMILY_API_SECRET;
  process.env.ORKHAN_MANAGER_URL = "https://manager.preview.test";
  process.env.ORKHAN_FAMILY_API_SECRET = "preview-secret";
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ recognized: false }) });
  try {
    const res = responseRecorder();
    await handler({ method: "POST", body: { chipNumber: "250123456789012" }, headers: {}, socket: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { recognized: false });
    assert.equal(res.headers["Cache-Control"], "no-store");
  } finally {
    global.fetch = originalFetch;
    process.env.ORKHAN_MANAGER_URL = previousUrl;
    process.env.ORKHAN_FAMILY_API_SECRET = previousSecret;
  }
});

test("refuse les méthodes autres que POST", async () => {
  const res = responseRecorder();
  await handler({ method: "GET", headers: {}, socket: {} }, res);
  assert.equal(res.statusCode, 405);
});
