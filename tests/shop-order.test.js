const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateShopOrder } = require("../api/_shop-order");
const { buildConnectedMedalPayload } = require("../api/medaille-webhook");

test("calcule les tarifs Animoco et les livraisons côté serveur", () => {
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 2, delivery: "retrait" }).order.totalCents, 3998);
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 1, delivery: "france", benefits: { dynastieFamily: true } }).order.totalCents, 2149);
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 1, delivery: "belgique" }).order.totalCents, 2489);
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 1, delivery: "autre" }).order.totalCents, null);
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 1, delivery: "autre" }).order.immediateCheckoutAvailable, false);
  assert.equal(calculateShopOrder({ productId: "animoco", quantity: 1, delivery: "france" }).order.immediateCheckoutAvailable, true);
});

test("ignore un prix frontend falsifié et une déclaration famille", async () => {
  const built = await buildConnectedMedalPayload({
    type: "medaille-connectee",
    quantite: "2",
    livraison: "france",
    famille_dynastie: "oui",
    pricing: { totalCents: 1 }
  });
  assert.equal(built.payload.familyEligible, false);
  assert.equal(built.payload.pricing.unitPriceCents, 1999);
  assert.equal(built.payload.pricing.totalCents, 4348);
  assert.equal("famille_dynastie" in built.payload, false);
});

test("applique le tarif famille uniquement après reconnaissance serveur", async () => {
  const built = await buildConnectedMedalPayload({
    type: "medaille-connectee",
    quantite: "2",
    livraison: "belgique",
    chipNumber: "250123456789012"
  }, {
    managerUrl: "https://manager.preview.test",
    secret: "preview-secret",
    fetch: async () => ({ ok: true, json: async () => ({ recognized: true }) })
  });
  assert.equal(built.payload.familyEligible, true);
  assert.equal(built.payload.pricing.unitPriceCents, 1799);
  assert.equal(built.payload.pricing.totalCents, 4088);
  assert.equal("chipNumber" in built.payload, false);
});

test("une puce inconnue conserve le tarif public et n’est pas transmise", async () => {
  const built = await buildConnectedMedalPayload({
    type: "medaille-connectee",
    quantite: "1",
    livraison: "retrait",
    chipNumber: "250123456789012"
  }, {
    managerUrl: "https://manager.preview.test",
    secret: "preview-secret",
    fetch: async () => ({ ok: true, json: async () => ({ recognized: false }) })
  });
  assert.equal(built.payload.pricing.totalCents, 1999);
  assert.equal("chipNumber" in built.payload, false);
});
