const test = require("node:test");
const assert = require("node:assert/strict");
const { FORMS_DISABLED_OUTSIDE_PRODUCTION, formsForwardingAllowed } = require("../api/_forms-environment");
const rdvHandler = require("../api/rdv-webhook");
const medalHandler = require("../api/medaille-webhook");

// Isolation des Previews : un formulaire RDV ou médaille envoyé hors Production ne doit jamais atteindre Orkhan
// Manager. En Production, le comportement reste celui d'avant (adresse configurée, sinon adresse par défaut).
const TOKEN = "jeton-de-test-formulaires";
const RDV_BODY = { nom: "Test", telephone: "0600000000", date: "2026-10-20" };
const MEDAL_BODY = { type: "medaille", nom: "Test", texte: "REX" };
const KEYS = ["VERCEL_ENV", "RDV_WEBHOOK_TOKEN", "ORKHAN_MANAGER_WEBHOOK_URL", "ORKHAN_MANAGER_MEDAILLE_WEBHOOK_URL"];

async function withEnvironment(values, action) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, text: async () => "" }; };
  for (const key of KEYS) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
  try { return await action(calls); } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

// Réponse compatible avec les deux styles de gestionnaire (res.end / res.status().json()).
function response() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(raw) { this.body = JSON.parse(raw); return this; }
  };
}

// Tentatives de se faire passer pour la Production depuis le navigateur.
function request(body) {
  return { method: "POST", body: { ...body, environment: "production", VERCEL_ENV: "production" }, headers: { "x-vercel-env": "production", host: "boutique.dynastiedorkhan.com" } };
}

const NON_PRODUCTION = [["preview"], ["development"], [undefined], [""], ["Production"], ["production "]];

test("seule la valeur serveur VERCEL_ENV=production autorise la transmission", () => {
  assert.equal(formsForwardingAllowed({ VERCEL_ENV: "production" }), true);
  for (const [value] of NON_PRODUCTION) assert.equal(formsForwardingAllowed({ VERCEL_ENV: value }), false, String(value));
});

test("hors Production, le formulaire RDV est refusé avant tout envoi, même si le navigateur prétend le contraire", async () => {
  for (const [environment] of NON_PRODUCTION) {
    await withEnvironment({ VERCEL_ENV: environment, RDV_WEBHOOK_TOKEN: TOKEN, ORKHAN_MANAGER_WEBHOOK_URL: "https://orkhan-manager.vercel.app/api/rdv-webhook" }, async (calls) => {
      const res = response();
      await rdvHandler(request(RDV_BODY), res);
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.body, { ok: false, error: FORMS_DISABLED_OUTSIDE_PRODUCTION });
      assert.equal(calls.length, 0, String(environment));
    });
  }
});

test("hors Production, le formulaire médaille est refusé avant toute vérification de puce et tout envoi", async () => {
  for (const [environment] of NON_PRODUCTION) {
    for (const body of [MEDAL_BODY, { type: "medaille-connectee", chipNumber: "250269812345678", quantite: 1, livraison: "retrait" }]) {
      await withEnvironment({ VERCEL_ENV: environment, RDV_WEBHOOK_TOKEN: TOKEN }, async (calls) => {
        const res = response();
        await medalHandler(request(body), res);
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.body, { ok: false, error: FORMS_DISABLED_OUTSIDE_PRODUCTION });
        assert.equal(calls.length, 0, String(environment));
      });
    }
  }
});

test("hors Production, aucune adresse par défaut vers la Production n'est utilisée, même sans variable", async () => {
  await withEnvironment({ VERCEL_ENV: "preview", RDV_WEBHOOK_TOKEN: TOKEN }, async (calls) => {
    await rdvHandler(request(RDV_BODY), response());
    await medalHandler(request(MEDAL_BODY), response());
    assert.equal(calls.length, 0);
  });
});

test("en Production, le formulaire RDV garde son comportement : adresse configurée, jeton, corps transmis", async () => {
  await withEnvironment({ VERCEL_ENV: "production", RDV_WEBHOOK_TOKEN: TOKEN, ORKHAN_MANAGER_WEBHOOK_URL: "https://manager.example/api/rdv-webhook" }, async (calls) => {
    const res = response();
    await rdvHandler({ method: "POST", body: RDV_BODY }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://manager.example/api/rdv-webhook");
    assert.equal(calls[0].options.headers["x-rdv-token"], TOKEN);
    assert.deepEqual(JSON.parse(calls[0].options.body), RDV_BODY);
  });
  await withEnvironment({ VERCEL_ENV: "production", RDV_WEBHOOK_TOKEN: TOKEN }, async (calls) => {
    await rdvHandler({ method: "POST", body: RDV_BODY }, response());
    assert.equal(calls[0].url, "https://orkhan-manager.vercel.app/api/rdv-webhook");
  });
});

test("en Production, le formulaire médaille garde son comportement et son adresse par défaut", async () => {
  await withEnvironment({ VERCEL_ENV: "production", RDV_WEBHOOK_TOKEN: TOKEN }, async (calls) => {
    const res = response();
    await medalHandler({ method: "POST", body: MEDAL_BODY, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(calls[0].url, "https://orkhan-manager.vercel.app/api/medaille-webhook");
    assert.equal(calls[0].options.headers["x-rdv-token"], TOKEN);
    assert.deepEqual(JSON.parse(calls[0].options.body), { type: "medaille", ...MEDAL_BODY });
  });
  await withEnvironment({ VERCEL_ENV: "production", RDV_WEBHOOK_TOKEN: TOKEN, ORKHAN_MANAGER_MEDAILLE_WEBHOOK_URL: "https://manager.example/api/medaille-webhook" }, async (calls) => {
    await medalHandler({ method: "POST", body: MEDAL_BODY, headers: {} }, response());
    assert.equal(calls[0].url, "https://manager.example/api/medaille-webhook");
  });
});

test("les autres méthodes restent refusées partout, sans envoi", async () => {
  for (const environment of ["production", "preview"]) {
    await withEnvironment({ VERCEL_ENV: environment, RDV_WEBHOOK_TOKEN: TOKEN }, async (calls) => {
      const rdv = response(); await rdvHandler({ method: "GET" }, rdv);
      const medal = response(); await medalHandler({ method: "GET" }, medal);
      assert.equal(rdv.statusCode, 405); assert.equal(medal.statusCode, 405);
      assert.equal(calls.length, 0);
    });
  }
});
