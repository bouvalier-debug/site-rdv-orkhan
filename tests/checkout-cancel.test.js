const test = require("node:test");
const assert = require("node:assert/strict");
const { cancelUrl, checkoutCancelToken, processCheckoutCancel, validCancelToken } = require("../api/_checkout-cancel");
const { createStripeAdapter } = require("../api/_payment/stripe");
const { executeCheckout } = require("../api/_checkout");
const { checkoutCancelMessage, handleCheckoutCancel, hasSignedCheckoutCancel, initCartPage } = require("../assets/cart");
const CHECKOUT_PENDING = "Vérification de l’annulation de votre paiement en cours…";

// Lot 2, étape 6 : annulation du paiement par le client. Le stock n'est libéré qu'après confirmation par Stripe que la
// session de la commande est expirée sans paiement ; sinon la réservation est conservée.
const ENV = { ORKHAN_SHOP_ORDERS_SECRET: "secret-boutique-test" };
const REFERENCE = "BOUT-2026-ABCDEF1234";
const SESSION = "cs_test_session123456";
const NOW = new Date("2026-10-17T10:10:00.000Z");

function stripeSession(overrides = {}) {
  return { id: SESSION, status: "expired", payment_status: "unpaid", client_reference_id: REFERENCE, metadata: { orderReference: REFERENCE }, ...overrides };
}

function deps({ state = {}, expire, retrieve } = {}) {
  const calls = [];
  return {
    calls,
    options: {
      env: ENV, now: () => NOW,
      manager: {
        async getCheckoutState(reference) { calls.push(["state", reference]); return { reference, status: "PENDING_PAYMENT", provider: "STRIPE", providerRef: SESSION, checkoutExpired: false, hasStockReservations: true, ...state }; },
        async markCheckoutExpired(reference, payload) { calls.push(["expired", reference, payload]); return { operation: "recorded", released: 1 }; },
        async flagCheckoutCancelUncertain(reference, payload) { calls.push(["flag", reference, payload]); return { operation: "flagged" }; }
      },
      stripe: {
        async expireCheckout(id) { calls.push(["stripe-expire", id]); if (expire instanceof Error) throw expire; return expire || stripeSession(); },
        async retrieveCheckout(id) { calls.push(["stripe-retrieve", id]); if (retrieve instanceof Error) throw retrieve; return retrieve; }
      }
    }
  };
}

const input = (extra = {}) => ({ order: REFERENCE, cancel: checkoutCancelToken(REFERENCE, ENV), ...extra });

test("le lien d'annulation est signé par commande et ne se devine pas", () => {
  const token = checkoutCancelToken(REFERENCE, ENV);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(validCancelToken(REFERENCE, token, ENV), true);
  assert.equal(validCancelToken("BOUT-2026-ZZZZZZ9999", token, ENV), false);
  assert.equal(validCancelToken(REFERENCE, token, { ORKHAN_SHOP_ORDERS_SECRET: "autre-secret" }), false);
  for (const value of ["", "x", `${token}x`, token.replace(/.$/, token.endsWith("A") ? "B" : "A"), null]) assert.equal(validCancelToken(REFERENCE, value, ENV), false);
  assert.throws(() => checkoutCancelToken(REFERENCE, {}), /orkhan_manager_not_configured/);
  const url = new URL(cancelUrl("https://boutique.test", REFERENCE, ENV));
  assert.deepEqual([url.pathname, url.searchParams.get("payment"), url.searchParams.get("order"), url.searchParams.get("cancel")], ["/panier/", "cancelled", REFERENCE, token]);
});

test("annulation confirmée par Stripe : la session est expirée puis le Manager libère le stock", async () => {
  const { calls, options } = deps();
  assert.deepEqual(await processCheckoutCancel(input(), options), { status: 200, body: { ok: true, outcome: "cancelled", operation: "recorded" } });
  assert.deepEqual(calls, [
    ["state", REFERENCE], ["stripe-expire", SESSION],
    ["expired", REFERENCE, { provider: "STRIPE", providerRef: SESSION, eventId: `cancel-${SESSION}`, expiredAt: NOW.toISOString() }]
  ]);
});

test("session déjà expirée : relue chez Stripe, puis libération si elle est bien expirée sans paiement", async () => {
  const { calls, options } = deps({ expire: new Error("stripe_session_request_failed"), retrieve: stripeSession() });
  assert.equal((await processCheckoutCancel(input(), options)).body.outcome, "cancelled");
  assert.deepEqual(calls.map((call) => call[0]), ["state", "stripe-expire", "stripe-retrieve", "expired"]);
  const recorded = deps({ state: { checkoutExpired: true } });
  assert.deepEqual(await processCheckoutCancel(input(), recorded.options), { status: 200, body: { ok: true, outcome: "cancelled", operation: "already_recorded" } });
  assert.deepEqual(recorded.calls.map((call) => call[0]), ["state"]);
});

test("paiement déjà confirmé : la commande n’est pas présentée comme annulée et rien n’est libéré", async () => {
  for (const state of [{ status: "PAID" }, { status: "REVIEW_REQUIRED" }, { status: "REFUNDED" }]) {
    const { calls, options } = deps({ state });
    assert.deepEqual(await processCheckoutCancel(input(), options), { status: 200, body: { ok: true, outcome: "payment_received" } });
    assert.deepEqual(calls.map((call) => call[0]), ["state"]);
  }
  for (const scenario of [{ expire: new Error("refus"), retrieve: stripeSession({ status: "complete", payment_status: "paid" }) }, { expire: stripeSession({ status: "complete", payment_status: "paid" }) }]) {
    const { calls, options } = deps(scenario);
    assert.equal((await processCheckoutCancel(input(), options)).body.outcome, "payment_received");
    assert.equal(calls.some((call) => call[0] === "expired"), false);
  }
  const raced = deps();
  raced.options.manager.markCheckoutExpired = async () => ({ operation: "ignored_paid", released: 0 });
  assert.equal((await processCheckoutCancel(input(), raced.options)).body.outcome, "payment_received");
});

test("échec ou incertitude : la réservation est conservée, rien n’est libéré, le paiement est à vérifier", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const cases = [
      { expire: new Error("refus"), retrieve: stripeSession({ status: "complete", payment_status: "unpaid" }) },
      { expire: new Error("refus"), retrieve: stripeSession({ status: "open" }) },
      { expire: new Error("refus"), retrieve: new Error("réseau") },
      { expire: stripeSession({ payment_status: "no_payment_required" }) },
      { expire: stripeSession({ metadata: { orderReference: "BOUT-2026-AUTRE00000" } }) },
      { expire: stripeSession({ client_reference_id: "BOUT-2026-AUTRE00000" }) },
      { expire: stripeSession({ id: "cs_test_autre_session" }) }
    ];
    for (const scenario of cases) {
      const { calls, options } = deps(scenario);
      assert.deepEqual(await processCheckoutCancel(input(), options), { status: 200, body: { ok: true, outcome: "uncertain" } });
      assert.equal(calls.some((call) => call[0] === "expired"), false);
      assert.deepEqual(calls.filter((call) => call[0] === "flag"), [["flag", REFERENCE, { provider: "STRIPE", providerRef: SESSION }]]);
    }
    for (const state of [{ providerRef: null }, { hasStockReservations: false }]) {
      const { calls, options } = deps({ state });
      assert.equal((await processCheckoutCancel(input(), options)).body.outcome, "uncertain");
      assert.equal(calls.some((call) => call[0].startsWith("stripe")), false);
    }
    const other = deps();
    other.options.manager.markCheckoutExpired = async () => ({ operation: "ignored_other_session", released: 0 });
    assert.equal((await processCheckoutCancel(input(), other.options)).body.outcome, "uncertain");
  } finally { console.warn = warn; }
});

test("un lien invalide ne déclenche aucun appel ; une erreur du Manager remonte pour un nouvel essai", async () => {
  for (const extra of [{ cancel: "faux" }, { order: "BOUT-2026-ZZZZZZ9999" }, { cancel: undefined }]) {
    const { calls, options } = deps();
    assert.deepEqual(await processCheckoutCancel(input(extra), options), { status: 400, body: { error: "invalid_cancel_link" } });
    assert.equal(calls.length, 0);
  }
  const { options } = deps();
  options.manager.markCheckoutExpired = async () => { throw new Error("SHOP_ORDER_UNAVAILABLE"); };
  await assert.rejects(processCheckoutCancel(input(), options));
});

test("Stripe : expiration et relecture d'une session, identifiant contrôlé, clé live refusée hors Production", async () => {
  const requests = [];
  const adapter = createStripeAdapter({ secretKey: "sk_test_fake", environment: "preview", fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => stripeSession() }; } });
  await adapter.expireCheckout(SESSION);
  await adapter.retrieveCheckout(SESSION);
  assert.deepEqual(requests.map((request) => [request.url, request.init.method, request.init.headers.Authorization]), [
    [`https://api.stripe.com/v1/checkout/sessions/${SESSION}/expire`, "POST", "Bearer sk_test_fake"],
    [`https://api.stripe.com/v1/checkout/sessions/${SESSION}`, "GET", "Bearer sk_test_fake"]
  ]);
  await assert.rejects(adapter.expireCheckout("../customers"), /invalid_checkout_session/);
  const failing = createStripeAdapter({ secretKey: "sk_test_fake", environment: "preview", fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { type: "invalid_request_error" } }) }) });
  await assert.rejects(failing.expireCheckout(SESSION), /stripe_session_request_failed/);
  assert.throws(() => createStripeAdapter({ secretKey: "sk_live_fake", environment: "preview" }), /stripe_live_key_outside_production/);
});

test("seul un panier avec des produits du catalogue reçoit le lien d'annulation signé", async () => {
  const run = async (items) => {
    const calls = [];
    await executeCheckout({ checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items, shipping: { mode: "pickup", pickupTiming: "appointment" },
      customer: { firstName: "Test", lastName: "Panier", email: "panier@example.test", phone: "0600000000", country: "FR" }, legalAcceptance: { version: "cgv-2026-10-21-2", accepted: true } }, {
      env: ENV, origin: "https://boutique.test", now: () => NOW,
      listCatalogue: async () => ({ available: true, products: [{ reference: "shampoing-test", name: "Shampoing", family: "COLIS", publicPriceCents: 1500, familyPriceCents: null, weightGrams: 300, purchasable: true, maxOrderQuantity: 3 }] }),
      manager: { async createOrder() { return { reference: REFERENCE }; }, async attachPaymentReference() { return {}; } },
      payment: { provider: "STRIPE", async createCheckout(payload) { calls.push(payload); return { providerRef: SESSION, checkoutUrl: "https://checkout.stripe.test" }; } }
    });
    return calls[0].cancelUrl;
  };
  assert.equal(await run([{ productId: "shampoing-test", quantity: 1 }]), cancelUrl("https://boutique.test", REFERENCE, ENV));
  assert.equal(await run([{ productId: "cosmetics:samba", quantity: 1 }]), "https://boutique.test/panier/?payment=cancelled");
});

function cartPage(search, respond) {
  const requests = []; const replaced = []; const messages = [];
  const status = { hidden: true, set textContent(value) { messages.push(value); }, get textContent() { return messages.at(-1); } };
  const root = {
    location: { pathname: "/panier/", search },
    document: { querySelector: (selector) => selector === "[data-checkout-status]" ? status : null },
    history: { replaceState: (...args) => replaced.push(args[2]) },
    fetch: async (url, init) => { requests.push({ url, init }); return respond(); }
  };
  return { root, requests, replaced, messages, status };
}

const SIGNED = `?payment=cancelled&order=${REFERENCE}&cancel=jeton`;
const reply = (status, body) => () => ({ ok: status === 200, status, json: async () => body });

test("page panier : « annulé » n’apparaît qu’après confirmation, jeton retiré de l’adresse", async () => {
  const page = cartPage(SIGNED, reply(200, { ok: true, outcome: "cancelled", operation: "recorded" }));
  assert.equal(await handleCheckoutCancel(page.root), "cancelled");
  assert.deepEqual(page.messages, [CHECKOUT_PENDING, checkoutCancelMessage("cancelled")]);
  assert.doesNotMatch(page.messages[0], /annulé/);
  assert.match(page.messages[1], /^Paiement annulé : aucun montant n’a été débité/);
  assert.equal(page.status.hidden, false);
  assert.deepEqual(page.replaced, ["/panier/?payment=cancelled"]);
  assert.equal(page.requests[0].url, "/api/checkout-cancel");
  assert.deepEqual(JSON.parse(page.requests[0].init.body), { order: REFERENCE, cancel: "jeton" });
});

test("page panier : paiement déjà reçu, la commande n’est pas présentée comme annulée", async () => {
  const page = cartPage(SIGNED, reply(200, { ok: true, outcome: "payment_received" }));
  assert.equal(await handleCheckoutCancel(page.root), "payment_received");
  assert.match(page.messages.at(-1), /paiement a déjà été reçu : cette commande n’est pas annulée/);
  assert.equal(page.messages.some((message) => /^Paiement annulé/.test(message)), false);
});

test("page panier : état incertain, erreur ou lien invalide, le paiement est à vérifier avant tout nouveau paiement", async () => {
  const cases = [
    reply(200, { ok: true, outcome: "uncertain" }), reply(503, { error: "checkout_cancel_unavailable" }), reply(400, { error: "invalid_cancel_link" }),
    reply(200, { ok: true, outcome: "inattendu" }), () => { throw new Error("réseau"); }, () => ({ ok: true, status: 200, json: async () => { throw new Error("json"); } })
  ];
  for (const respond of cases) {
    const page = cartPage(SIGNED, respond);
    assert.equal(await handleCheckoutCancel(page.root), "uncertain");
    assert.match(page.messages.at(-1), /Avant tout nouveau paiement, vérifiez/);
    assert.equal(page.messages.some((message) => /annulé/.test(message)), false);
  }
});

test("page panier : un retour sans lien signé (paniers historiques) n’affiche rien et n’appelle rien", async () => {
  for (const search of ["?payment=cancelled", "", "?order=x&cancel=y"]) {
    const page = cartPage(search, reply(200, {}));
    assert.equal(await handleCheckoutCancel(page.root), null);
    assert.deepEqual([page.messages, page.requests, page.replaced], [[], [], []]);
  }
});

test("annulation incertaine : signalement immédiat au Manager, une seule demande, sans effet sur l'issue en cas d'échec", async () => {
  const warn = console.warn; const error = console.error; console.warn = () => {}; console.error = () => {};
  try {
    const unattached = deps({ state: { providerRef: null } });
    assert.equal((await processCheckoutCancel(input(), unattached.options)).body.outcome, "uncertain");
    assert.deepEqual(unattached.calls.filter((call) => call[0] === "flag"), [["flag", REFERENCE, { provider: "STRIPE", providerRef: null }]]);
    const failing = deps({ expire: new Error("refus"), retrieve: new Error("réseau") });
    failing.options.manager.flagCheckoutCancelUncertain = async () => { throw Object.assign(new Error("SHOP_ORDER_UNAVAILABLE"), { status: 503 }); };
    assert.deepEqual(await processCheckoutCancel(input(), failing.options), { status: 200, body: { ok: true, outcome: "uncertain" } });
    for (const scenario of [{}, { state: { status: "PAID" } }, { state: { checkoutExpired: true } }, { state: { hasStockReservations: false } }, { expire: stripeSession({ status: "complete", payment_status: "paid" }) }]) {
      const { calls, options } = deps(scenario);
      await processCheckoutCancel(input(), options);
      assert.equal(calls.some((call) => call[0] === "flag"), false);
    }
  } finally { console.warn = warn; console.error = error; }
});

// Correctif A1 : au retour d'une annulation signée, le premier devis est demandé seulement après l'annulation (stock
// libéré côté serveur). Sans annulation signée, le devis est demandé tout de suite, comme avant.
function cartInit(search, respond) {
  const page = cartPage(search, respond);
  const events = [];
  const mount = (root, options) => {
    events.push(["mount", options.deferInitialQuote]);
    if (!options.deferInitialQuote) events.push(["quote"]);
    return { refresh: async () => { events.push(["quote"]); } };
  };
  const cancel = async (root) => { events.push(["cancel:start"]); const outcome = await handleCheckoutCancel(root); events.push(["cancel:" + outcome]); return outcome; };
  return { page, events, run: () => initCartPage(page.root, { store: {}, mount, cancel }) };
}

test("A1 : annulation confirmée, le devis est recalculé une seule fois, après la libération du stock", async () => {
  const { events, run } = cartInit(SIGNED, reply(200, { ok: true, outcome: "cancelled", operation: "recorded" }));
  assert.equal(await run(), "cancelled");
  assert.deepEqual(events, [["mount", true], ["cancel:start"], ["cancel:cancelled"], ["quote"]]);
});

test("A1 : issue incertaine ou paiement reçu, le devis est tout de même recalculé après la réponse du serveur", async () => {
  for (const [respond, outcome] of [[reply(200, { ok: true, outcome: "payment_received" }), "payment_received"], [reply(503, { error: "x" }), "uncertain"], [() => { throw new Error("réseau"); }, "uncertain"]]) {
    const { events, run } = cartInit(SIGNED, respond);
    assert.equal(await run(), outcome);
    assert.deepEqual(events.map((event) => event[0]), ["mount", "cancel:start", "cancel:" + outcome, "quote"]);
  }
});

test("A1 : sans annulation signée (paniers historiques, visite normale), le devis part tout de suite, une seule fois", async () => {
  for (const search of ["", "?payment=cancelled", "?order=x&cancel=y", "?payment=cancelled&order=x"]) {
    const { events, run } = cartInit(search, reply(200, {}));
    assert.equal(await run(), null);
    assert.deepEqual(events, [["mount", false], ["quote"], ["cancel:start"], ["cancel:null"]]);
  }
});

test("A1 : détection de l'annulation signée", () => {
  const root = (search, fetch = async () => ({})) => ({ location: { search }, fetch });
  assert.equal(hasSignedCheckoutCancel(root(SIGNED)), true);
  assert.equal(hasSignedCheckoutCancel(root("?payment=cancelled")), false);
  assert.equal(hasSignedCheckoutCancel(root(SIGNED, null)), false);
  assert.equal(hasSignedCheckoutCancel({ fetch: async () => ({}) }), false);
});

test("A1 : la page panier diffère son premier devis seulement sur demande", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "assets", "cart.js"), "utf8");
  const end = source.slice(source.indexOf("restoreCustomer();"), source.indexOf("return { customerStore, refresh"));
  assert.match(end, /if \(options\.deferInitialQuote\) \{[\s\S]*renderLines\(store\.getItems\(\), null\);[\s\S]*\} else refresh\(\);/);
  assert.match(source, /if \(root\.document\.querySelector\("\[data-cart-page\]"\)\) initCartPage\(root, \{ store \}\);/);
});
