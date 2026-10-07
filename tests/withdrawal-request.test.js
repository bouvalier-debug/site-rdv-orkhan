const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("../api/withdrawal-request");
const { createManagerClient } = require("../api/_orkhan-shop-orders");

function response() {
  return { statusCode: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
const payload = { firstName: "David", lastName: "Boitel", orderReference: " bout-2026-abcdefghij ", email: "client@example.com", products: "", message: "" };

test("le proxy conserve la référence saisie, protège l'idempotence et ne divulgue pas le rattachement", async () => {
  let sent;
  const req = { method: "POST", headers: { "idempotency-key": "123e4567-e89b-42d3-a456-426614174000" }, body: payload, socket: {} };
  const res = response();
  await handler(req, res, { consumeRequest: () => true, managerClient: { createWithdrawalRequest: async (body, key) => { sent = { body, key }; return { requestId: "request-1", recordedAt: "2026-10-07T12:32:00Z", operation: "created", matchStatus: "MATCHED_AUTO" }; } } });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { ok: true, requestId: "request-1", recordedAt: "2026-10-07T12:32:00Z" });
  assert.equal(sent.body.orderReference, "bout-2026-abcdefghij");
  assert.equal(sent.key, req.headers["idempotency-key"]);
});

test("la règle CSS masque effectivement tous les éléments hidden", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "renoncer-au-contrat", "index.html"), "utf8");
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /\.withdrawal-form:not\(\[hidden\]\)\{display:grid/);
});

test("la confirmation envoie le snapshot figé et non une relecture du formulaire caché", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "withdrawal.js"), "utf8");
  assert.match(script, /confirmedPayload\s*=\s*Object\.freeze\(\{ \.\.\.data \}\)/);
  assert.match(script, /body:\s*JSON\.stringify\(confirmedPayload\)/);
  assert.doesNotMatch(script, /body:\s*JSON\.stringify\(payload\(\)\)/);
  assert.match(script, /if \(!form\.hidden\) \{ key = null; confirmedPayload = null; \}/);
});

test("le succès ne laisse visible que le message final", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "withdrawal.js"), "utf8");
  assert.match(script, /form\.hidden = true; summary\.hidden = true; status\.hidden = false/);
});

test("une erreur conserve le snapshot et la clé tandis que revenir modifier les invalide", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "withdrawal.js"), "utf8");
  const failure = script.slice(script.indexOf("} catch {"), script.indexOf("} finally"));
  assert.doesNotMatch(failure, /key\s*=|confirmedPayload\s*=/);
  assert.match(script, /getElementById\("edit"\)[\s\S]*key = null; confirmedPayload = null/);
});

test("le champ piège renvoie un faux succès sans appeler le Manager", async () => {
  let calls = 0; const res = response();
  await handler({ method: "POST", headers: {}, body: { ...payload, website: "robot" }, socket: {} }, res, { consumeRequest: () => true, managerClient: { createWithdrawalRequest: async () => { calls += 1; } } });
  assert.equal(res.statusCode, 200); assert.equal(calls, 0); assert.equal(res.body.ok, true);
});

test("la page reprend les textes E1, confirme en deux temps et conserve la clé après erreur", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "renoncer-au-contrat", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "assets", "withdrawal.js"), "utf8");
  for (const text of ["Renoncer au contrat (droit de rétractation)", "Aucun compte n'est nécessaire.", "Continuer", "Confirmer la rétractation", "Votre demande de rétractation a été enregistrée le"]) assert.match(html + script, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(script, /form\.addEventListener\("submit"/); assert.match(script, /textContent/); assert.match(script, /if \(sending\) return/);
  assert.doesNotMatch(script, /catch[\s\S]{0,300}key\s*=\s*null/);
});

test("le client Manager utilise la route statique et la clé d'idempotence", async () => {
  let request; const client = createManagerClient({ baseUrl: "https://manager.example", secret: "secret", fetch: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({}) }; } });
  await client.createWithdrawalRequest(payload, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(request.url, "https://manager.example/api/shop-orders/withdrawal-requests");
  assert.equal(request.options.headers["Idempotency-Key"], "123e4567-e89b-42d3-a456-426614174000");
});
