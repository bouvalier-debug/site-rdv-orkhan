const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { confirmationSnapshot, retrieveCheckoutSession } = require("../api/order-confirmation");

const reference = "BOUT-2026-B39D17114C";

function stripeSession(overrides = {}) {
  return {
    id: "cs_test_example123",
    client_reference_id: reference,
    metadata: { orderReference: reference },
    payment_status: "paid",
    customer_details: {
      name: "Client Secret",
      email: "client@example.test",
      address: { line1: "1 rue privée" }
    },
    ...overrides
  };
}

test("la confirmation ne renvoie que la référence et l'état du paiement", () => {
  const snapshot = confirmationSnapshot(stripeSession());
  assert.deepEqual(snapshot, {
    ok: true,
    orderReference: reference,
    paymentStatus: "paid"
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /Client Secret|example\.test|rue privée/);
});

test("une session Stripe incohérente avec sa metadata est refusée", () => {
  assert.equal(confirmationSnapshot(stripeSession({ metadata: { orderReference: "BOUT-2026-AAAAAAAAAA" } })), null);
  assert.equal(confirmationSnapshot(stripeSession({ client_reference_id: "invalide" })), null);
});

test("un paiement non finalisé reste pending", () => {
  assert.equal(confirmationSnapshot(stripeSession({ payment_status: "unpaid" })).paymentStatus, "pending");
});

test("la récupération Stripe utilise uniquement la clé serveur", async () => {
  let request;
  const session = await retrieveCheckoutSession("cs_test_example123", {
    secretKey: "sk_test_fake",
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => stripeSession() };
    }
  });
  assert.equal(session.id, "cs_test_example123");
  assert.match(request.url, /\/v1\/checkout\/sessions\/cs_test_example123$/);
  assert.equal(request.options.headers.Authorization, "Bearer sk_test_fake");
});

test("la page de confirmation vérifie la session côté serveur et vide le panier seulement après paid", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "panier", "confirmation", "index.html"), "utf8");
  assert.match(html, /api\/order-confirmation\?session_id=/);
  assert.match(html, /result\.paymentStatus === "paid"/);
  assert.match(html, /localStorage\.removeItem\(CART_KEY\)/);
  assert.match(html, /Aucune donnée personnelle n’est affichée/);
  assert.doesNotMatch(html, /customer_details|firstName|lastName|postalCode/);
});
