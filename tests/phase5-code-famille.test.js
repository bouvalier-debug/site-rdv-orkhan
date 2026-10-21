const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolveFamilyEligibility } = require("../api/_family-benefit");
const { normalizeFamilyCode, verifyFamilyCode } = require("../api/_family-eligibility");
const { quoteCartRequest } = require("../api/cart-quote");
const { executeCheckout, SHOP_LEGAL_CURRENT_VERSION } = require("../api/_checkout");
const cart = require("../assets/cart");

// Phase 5 : code temporaire Familles Dynastie, deuxième preuve du tarif Famille à côté de la puce I-CAD (FAM-01 à FAM-07).
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const CODE = "DYN-7K2Q-M9XA";
const CHIP = "250269812345678";
const CROQUETTES = { reference: "croquettes-test", name: "Croquettes", family: "CROQUETTES", publicPriceCents: 1490, familyPriceCents: 1290, weightGrams: 1500, purchasable: true, maxOrderQuantity: 12 };
const codeVerifier = (recognized, calls = []) => async (code) => { calls.push(code); return { status: "ok", recognized }; };
const quote = (input, options) => quoteCartRequest(input, { listCatalogue: async () => ({ available: true, products: [CROQUETTES] }), ...options });

test("le code est normalisé comme dans le Manager et vérifié par la route verify-code, sans la puce", async () => {
  assert.equal(normalizeFamilyCode("dyn 7k2q m9xa"), "7K2QM9XA");
  assert.equal(normalizeFamilyCode("DYN-0OIL-1234"), "00111234");
  assert.equal(normalizeFamilyCode(CHIP), null);
  assert.equal(normalizeFamilyCode("DYN-UUUU-1234"), null);
  const requests = [];
  const result = await verifyFamilyCode(" dyn-7k2q-m9xa ", {
    managerUrl: "https://manager.test/", secret: "secret-test",
    fetch: async (url, init) => { requests.push([url, JSON.parse(init.body), init.headers["x-dynastie-family-token"]]); return { ok: true, json: async () => ({ recognized: true }) }; }
  });
  assert.deepEqual(result, { status: "ok", recognized: true });
  assert.deepEqual(requests, [["https://manager.test/api/families/verify-code", { familyCode: "7K2QM9XA" }, "secret-test"]]);
  assert.deepEqual(await verifyFamilyCode("pas-un-code", { managerUrl: "https://manager.test", secret: "s" }), { status: "invalid", recognized: false });
  assert.deepEqual(await verifyFamilyCode(CODE, { managerUrl: "https://manager.test", secret: "s", fetch: async () => ({ ok: false }) }), { status: "unavailable", recognized: false });
});

test("une seule preuve par panier : code OU puce, jamais les deux ; la puce reste inchangée", async () => {
  const chipCalls = [];
  assert.deepEqual(await resolveFamilyEligibility([], { familyCode: CODE, familyChipNumber: CHIP }), { error: "family_proof_conflict", status: 400 });
  assert.deepEqual(await resolveFamilyEligibility([{ productId: "animoco", options: { chipNumber: CHIP } }], { familyCode: CODE }), { error: "family_proof_conflict", status: 400 });
  assert.deepEqual(await resolveFamilyEligibility([], { familyCode: "abc" }), { error: "invalid_family_code", status: 400 });
  assert.deepEqual(await resolveFamilyEligibility([], { familyCode: CODE, verifyFamilyCode: async () => ({ status: "unavailable" }) }), { error: "family_verification_unavailable", status: 503 });
  assert.equal((await resolveFamilyEligibility([], { familyChipNumber: CHIP, verifyFamilyChip: async (chip) => { chipCalls.push(chip); return { status: "ok", recognized: true }; } })).familyEligible, true);
  assert.deepEqual(chipCalls, [CHIP]);
});

test("devis : un code reconnu donne le tarif Famille, un code non reconnu ou expiré le tarif public", async () => {
  const items = [{ productId: "croquettes-test", quantity: 1 }];
  const ok = await quote({ items, familyCode: CODE }, { verifyFamilyCode: codeVerifier(true) });
  assert.equal(ok.quote.lines[0].unitPriceCents, 1290);
  assert.equal(ok.quote.benefits.dynastieFamily, true);
  const refused = await quote({ items, familyCode: CODE }, { verifyFamilyCode: codeVerifier(false) });
  assert.equal(refused.quote.lines[0].unitPriceCents, 1490);
});

test("paiement : le code est revérifié côté serveur ; ni le Manager ni Stripe ne reçoivent le code", async () => {
  const created = [];
  const stripe = [];
  const calls = [];
  const result = await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items: [{ productId: "croquettes-test", quantity: 1 }], shipping: { mode: "pickup", pickupTiming: "appointment" },
    familyCode: CODE,
    customer: { firstName: "Test", lastName: "Famille", email: "contact@dynastiedorkhan.com", phone: "0600000000", country: "FR" },
    legalAcceptance: { version: SHOP_LEGAL_CURRENT_VERSION, accepted: true }
  }, {
    env: { ORKHAN_SHOP_ORDERS_SECRET: "secret-test" }, origin: "https://boutique.test",
    listCatalogue: async () => ({ available: true, products: [CROQUETTES] }), verifyFamilyCode: codeVerifier(true, calls),
    manager: { async createOrder(payload) { created.push(payload); return { reference: "BOUT-2026-ABCDEF1234" }; }, async attachPaymentReference() { return {}; } },
    payment: { provider: "STRIPE", async createCheckout(input) { stripe.push(input); return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test" }; } }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [CODE]);
  assert.equal(created[0].dynastieFamilyEligible, true);
  assert.equal(created[0].lines[0].unitPriceCents, 1290);
  assert.doesNotMatch(JSON.stringify(created[0]) + JSON.stringify(stripe), /7K2Q|M9XA/i);
});

test("panier : un seul champ ; une saisie avec lettres part comme code, sinon comme puce", () => {
  assert.deepEqual(cart.buildQuotePayload([], null, CODE), { items: [], familyCode: CODE });
  assert.deepEqual(cart.buildQuotePayload([], null, "250 269 812 345 678"), { items: [], familyChipNumber: "250 269 812 345 678" });
  assert.equal("familyCode" in cart.buildQuotePayload([], null, ""), false);
  const html = read("panier/index.html");
  assert.match(html, /Numéro de puce ou code Famille/);
  assert.equal((html.match(/data-family-chip /g) || []).length, 1);
});

test("CGV : seule l'article 4.3 change, les versions précédentes restent archivées ; la confidentialité mentionne le code", () => {
  const current = require("../legal/cgv-2026-10-21-2.json");
  const previous = require("../legal/cgv-2026-10-21.json");
  // Corrections finales : la version en vigueur est cgv-2026-10-21-3 ; elle ne diffère de -2 que par l'article 7.5 (sans délai de 24 h).
  const latest = require("../legal/cgv-2026-10-21-3.json");
  assert.equal(SHOP_LEGAL_CURRENT_VERSION, latest.version);
  const latestChanged = latest.blocks.map((block, index) => JSON.stringify(block) !== JSON.stringify(current.blocks[index]) ? index : null).filter((index) => index !== null);
  assert.equal(latestChanged.length, 2, "titre de version et article 7.5");
  assert.match(latest.blocks[latestChanged[1]].text, /^7\.5\. \*\*Retrait à l'élevage\*\*.*lors du départ du chiot, soit à une autre date convenue/);
  assert.doesNotMatch(latest.blocks[latestChanged[1]].text, /24 heures/);
  const changed = current.blocks.map((block, index) => JSON.stringify(block) !== JSON.stringify(previous.blocks[index]) ? index : null).filter((index) => index !== null);
  assert.equal(changed.length, 2);
  assert.match(JSON.stringify(current.blocks[changed[1]]), /^\{"type":"p","text":"4\.3\. \*\*Tarif Famille Dynastie\.\*\*.*code Famille temporaire/);
  for (const version of ["cgv-2026-10-05", "cgv-2026-10-07", "cgv-2026-10-21", "cgv-2026-10-21-2"]) {
    assert.equal(require(`../legal/${version}.json`).version, version);
    assert.match(read(`conditions-generales-de-vente/${version}/index.html`), new RegExp(`Version ${version} — validée le`));
  }
  assert.match(read("confidentialite/index.html"), /code Famille temporaire remis lors de la réservation d'un chiot/);
});
