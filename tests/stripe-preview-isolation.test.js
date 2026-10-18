const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createStripeAdapter, findCheckoutSessionByPaymentIntent, stripeSecretKey } = require("../api/_payment/stripe");
const { retrieveCheckoutSession } = require("../api/order-confirmation");

// Lot 2, étape 7 (préparation) : hors Production, aucune opération Stripe (écriture ou lecture) n'utilise une clé
// Live ; le sous-domaine de test n'est pas indexé, sans toucher au référencement de la Boutique Production.
const NON_PRODUCTION = ["preview", "development", "Production", ""];
const LIVE_KEYS = ["sk_live_fake", "rk_live_fake", "  sk_live_fake  "];

function recordingFetch() {
  const calls = [];
  return { calls, fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: "cs_test_session123456", data: [] }) }; } };
}

test("la clé Stripe Live est refusée hors Production pour toutes les opérations, avant tout appel réseau", async () => {
  for (const environment of NON_PRODUCTION) {
    for (const secretKey of LIVE_KEYS) {
      const { calls, fetch } = recordingFetch();
      assert.throws(() => stripeSecretKey({ secretKey, environment }), /stripe_live_key_outside_production/);
      assert.throws(() => createStripeAdapter({ secretKey, environment, fetch }), /stripe_live_key_outside_production/);
      await assert.rejects(findCheckoutSessionByPaymentIntent("pi_test_1", { secretKey, environment, fetch }), /stripe_live_key_outside_production/);
      await assert.rejects(retrieveCheckoutSession("cs_test_session123456", { secretKey, environment, fetch }), /stripe_live_key_outside_production/);
      assert.equal(calls.length, 0, `${environment} ${secretKey}`);
    }
  }
});

test("hors Production, une clé de test fonctionne pour les lectures ; en Production, la clé Live reste acceptée", async () => {
  for (const [secretKey, environment] of [["sk_test_fake", "preview"], ["sk_live_fake", "production"]]) {
    const { calls, fetch } = recordingFetch();
    await findCheckoutSessionByPaymentIntent("pi_test_1", { secretKey, environment, fetch });
    await retrieveCheckoutSession("cs_test_session123456", { secretKey, environment, fetch });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.init.headers.Authorization === `Bearer ${secretKey}`));
  }
  assert.throws(() => stripeSecretKey({ secretKey: "", environment: "preview" }), /stripe_not_configured/);
});

test("le sous-domaine de test reçoit noindex, nofollow ; la Boutique Production n'est pas concernée", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const robots = config.headers.filter((rule) => rule.headers.some((header) => header.key.toLowerCase() === "x-robots-tag"));
  assert.equal(robots.length, 1);
  assert.deepEqual(robots[0].has, [{ type: "host", value: "test-boutique.dynastiedorkhan.com" }]);
  assert.equal(robots[0].source, "/(.*)");
  assert.deepEqual(robots[0].headers, [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
});
