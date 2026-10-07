const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const withdrawalHandler = require("../api/withdrawal-request");
const familyHandler = require("../api/family-eligibility");

const root = path.join(__dirname, "..");

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

const withdrawalBody = { firstName: "Jean", lastName: "Martin", orderReference: "BOUT-2026-ABCDEFGHIJ", email: "client@example.com", products: "", message: "" };

test("18.42 cinq rétractations par dix minutes et par IP, 429 à la sixième, Famille toujours acceptée", async () => {
  const ip = "203.0.113.42";
  const managerClient = { createWithdrawalRequest: async () => ({ requestId: "request-1", recordedAt: "2026-10-07T12:00:00Z", operation: "created" }) };
  const statuses = [];
  for (let index = 0; index < 6; index += 1) {
    const res = response();
    await withdrawalHandler({ method: "POST", headers: { "x-forwarded-for": ip, "idempotency-key": "123e4567-e89b-42d3-a456-426614174000" }, body: withdrawalBody, socket: {} }, res, { managerClient });
    statuses.push(res.statusCode);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);

  const previous = { url: process.env.ORKHAN_MANAGER_URL, secret: process.env.ORKHAN_FAMILY_API_SECRET, fetch: global.fetch };
  process.env.ORKHAN_MANAGER_URL = "https://manager.example.test";
  process.env.ORKHAN_FAMILY_API_SECRET = "test-family-secret";
  global.fetch = async () => ({ ok: true, json: async () => ({ recognized: true }) });
  try {
    const res = response();
    await familyHandler({ method: "POST", headers: { "x-forwarded-for": ip }, body: { chipNumber: "250269811234567" }, socket: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { recognized: true });
  } finally {
    if (previous.url === undefined) delete process.env.ORKHAN_MANAGER_URL; else process.env.ORKHAN_MANAGER_URL = previous.url;
    if (previous.secret === undefined) delete process.env.ORKHAN_FAMILY_API_SECRET; else process.env.ORKHAN_FAMILY_API_SECRET = previous.secret;
    global.fetch = previous.fetch;
  }
});

function element(id) {
  const listeners = {};
  return {
    id, hidden: false, disabled: false, textContent: "",
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    async dispatch(type) { for (const listener of listeners[type] || []) await listener({ type, preventDefault() {} }); }
  };
}

function loadWithdrawalScript(fetchImpl) {
  const ids = ["withdrawal-form", "withdrawal-summary", "summary-text", "withdrawal-status", "confirm", "edit"];
  const elements = Object.fromEntries(ids.map((id) => [id, element(id)]));
  const form = elements["withdrawal-form"];
  form.reportValidity = () => true;
  form.values = { ...withdrawalBody };
  elements["withdrawal-summary"].hidden = true;
  elements["withdrawal-status"].hidden = true;
  const context = {
    document: { getElementById: (id) => elements[id] || null },
    FormData: class { constructor(target) { this.target = target; } entries() { return Object.entries(this.target.values); } },
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" },
    fetch: fetchImpl,
    Intl, Object, JSON, Date, Error, Promise
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets", "withdrawal.js"), "utf8"), context);
  return elements;
}

const FALLBACK = "Votre demande n'a pas pu être enregistrée. Réessayez dans quelques instants. Vous pouvez aussi nous notifier votre rétractation par email à contact@dynastiedorkhan.com ou par courrier, avec le formulaire de rétractation des CGV.";

for (const [label, fetchImpl] of [
  ["réseau en échec", async () => { throw new TypeError("Failed to fetch"); }],
  ["Manager en 503", async () => ({ ok: false, status: 503, json: async () => ({ error: "withdrawal_unavailable" }) })]
]) {
  test(`18.43 Manager indisponible (${label}) : message de repli, aucun faux succès`, async () => {
    const calls = [];
    const elements = loadWithdrawalScript(async (...args) => { calls.push(args); return fetchImpl(); });
    await elements["withdrawal-form"].dispatch("submit");
    assert.equal(elements["withdrawal-summary"].hidden, false);
    await elements.confirm.dispatch("click");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/api/withdrawal-request");
    assert.equal(elements["withdrawal-status"].hidden, false);
    assert.equal(elements["withdrawal-status"].textContent, FALLBACK);
    assert.doesNotMatch(elements["withdrawal-status"].textContent, /a été enregistrée le/);
    assert.equal(elements["withdrawal-summary"].hidden, false);
    assert.equal(elements.confirm.disabled, false);
  });
}
