const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  EMPTY_SHIPPING_MESSAGE,
  autoInit,
  buildCheckoutPayload,
  buildQuotePayload,
  createCartStore,
  createCustomerStore,
  countryForShippingMode,
  displayOptionRows,
  parseStoredCart,
  parseStoredCustomer,
  quoteStatusMessage,
  requestQuote,
  requestCheckout,
  requiredCustomerFields,
  shippingModesForCountry
} = require("../assets/cart");

const cartPage = fs.readFileSync(path.join(__dirname, "..", "panier", "index.html"), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

const NOW = Date.parse("2026-10-06T12:00:00.000Z");

function storeWithIds(storage = memoryStorage()) {
  let nextId = 0;
  return createCartStore({ storage, idFactory: () => `line-${++nextId}` });
}

test("un panier vide est restauré sans erreur", () => {
  const store = storeWithIds();
  assert.deepEqual(store.getItems(), []);
  assert.equal(store.count(), 0);
});

test("plusieurs lignes sont ajoutées et conservées dans localStorage", () => {
  const storage = memoryStorage();
  const store = storeWithIds(storage);
  store.add({ productId: "animoco", quantity: 2 });
  store.add({ productId: "red-dingo:01-BN", quantity: 1, options: { size: "S", colour: "Black" } });
  assert.equal(store.getItems().length, 2);
  assert.equal(store.count(), 3);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).items.length, 2);
});

test("la simple lecture du panier ne prolonge pas sa durée de conservation", () => {
  const updatedAt = "2026-10-01T12:00:00.000Z";
  const stored = JSON.stringify({
    version: 1,
    updatedAt,
    items: [{ lineId: "line-1", productId: "animoco", quantity: 1 }]
  });
  const storage = memoryStorage({ [STORAGE_KEY]: stored });
  const store = createCartStore({ storage, now: () => NOW });
  assert.equal(store.count(), 1);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).updatedAt, updatedAt);
});

test("le compteur additionne les quantités et se resynchronise entre onglets", () => {
  const storage = memoryStorage();
  const badges = [{ textContent: "", hidden: true, setAttribute(name, value) { this[name] = value; } }];
  const listeners = {};
  const root = {
    localStorage: storage,
    document: {
      querySelector: () => null,
      querySelectorAll: (selector) => selector === "[data-cart-count]" ? badges : []
    },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  autoInit(root);
  const otherTab = storeWithIds(storage);
  otherTab.add({ productId: "animoco", quantity: 1 });
  otherTab.add({ productId: "cosmetics:bye-bye", quantity: 1 });
  otherTab.add({ productId: "cosmetics:samba", quantity: 1 });
  otherTab.add({ productId: "cosmetics:block", quantity: 2 });
  listeners.storage({ key: STORAGE_KEY });
  assert.equal(badges[0].textContent, "5");
  assert.equal(badges[0].hidden, false);
  assert.equal(badges[0]["aria-label"], "5 articles dans le panier");
});

test("les quantités sont modifiables uniquement de 1 à 20", () => {
  const store = storeWithIds();
  store.add({ productId: "animoco", quantity: 1 });
  store.updateQuantity("line-1", 20);
  assert.equal(store.getItems()[0].quantity, 20);
  assert.throws(() => store.updateQuantity("line-1", 0), /invalid_quantity/);
  assert.throws(() => store.updateQuantity("line-1", 1.5), /invalid_quantity/);
});

test("deux Red Dingo gardent des personnalisations et identités distinctes", () => {
  const store = storeWithIds();
  store.add({ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Black", frontLines: ["NALA", "0600000000"] } });
  store.add({ productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "M", colour: "Red", frontLines: ["ORKHAN"] } });
  const items = store.getItems();
  assert.notEqual(items[0].lineId, items[1].lineId);
  assert.deepEqual(items[0].options.frontLines, ["NALA", "0600000000"]);
  assert.deepEqual(items[1].options.frontLines, ["ORKHAN"]);
});

test("une ligne peut être supprimée", () => {
  const store = storeWithIds();
  store.add({ productId: "animoco", quantity: 1 });
  store.add({ productId: "red-dingo:01-BN", quantity: 1, options: { size: "S", colour: "Black" } });
  store.remove("line-1");
  assert.deepEqual(store.getItems().map((item) => item.lineId), ["line-2"]);
});

test("les données localStorage invalides ou corrompues donnent un panier vide", () => {
  assert.deepEqual(parseStoredCart("pas du json"), []);
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 99, items: [] })), []);
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 1, items: [{ productId: "animoco", quantity: 0 }] })), []);
});

test("shipping_unavailable produit un message clair sans tarif inventé", () => {
  const result = { error: "shipping_unavailable", availableModes: ["pickup"] };
  assert.match(quoteStatusMessage(result), /seul le retrait à l’élevage est proposé/i);
  assert.deepEqual(result.availableModes, ["pickup"]);
});

test("aucun prix navigateur n'entre dans le payload de devis", () => {
  const payload = buildQuotePayload([{
    lineId: "line-1",
    productId: "animoco",
    quantity: 1,
    priceCents: 1,
    subtotalCents: 1,
    options: { engraving: "ORKHAN", priceCents: 1, nested: { totalCents: 2 } }
  }], { mode: "animoco-light-fr", priceCents: 1 }, { dynastieFamily: true, totalCents: 1 });
  assert.deepEqual(payload, {
    items: [{ productId: "animoco", quantity: 1, options: { engraving: "ORKHAN", nested: {} } }],
    shipping: { mode: "animoco-light-fr" }
  });
  assert.doesNotMatch(JSON.stringify(payload), /price|subtotal|total/i);
});

test("requestQuote envoie uniquement le payload assaini à cart-quote", async () => {
  let request;
  const result = await requestQuote([{
    lineId: "line-1", productId: "animoco", quantity: 1, unitPriceCents: 1
  }], null, {
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ quote: { totalCents: 1999 } }) };
    }
  });
  assert.equal(request.url, "/api/cart-quote");
  assert.deepEqual(JSON.parse(request.options.body), { items: [{ productId: "animoco", quantity: 1 }] });
  assert.equal(result.quote.totalCents, 1999);
});

test("le rendu Animoco masque les options techniques et le numéro de puce", () => {
  const rows = displayOptionRows({
    productId: "animoco",
    options: { chipNumber: "250123456789012", familyEligible: true }
  });
  assert.deepEqual(rows, [["Tarif Famille Dynastie", "numéro de puce vérifié au moment du paiement"]]);
  const rendered = JSON.stringify(rows);
  assert.doesNotMatch(rendered, /Chip Number|Family Eligible|250123456789012|true/);
  assert.deepEqual(displayOptionRows({
    productId: "red-dingo:01-BN",
    options: { size: "S", colour: "Black", frontLines: ["NALA"] }
  }), [["Taille", "S"], ["Couleur", "Black"], ["Gravure recto", "NALA"]]);
});

test("une indisponibilité Famille bloque le total et le paiement avec le message prévu", () => {
  const result = { error: "family_verification_unavailable", status: 503 };
  assert.equal(quoteStatusMessage(result), "Le service de vérification du tarif Famille est momentanément indisponible. Réessayez dans quelques instants, ou retirez le numéro de puce pour commander au tarif public.");
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "cart.js"), "utf8");
  assert.match(source, /checkoutButton\.disabled = result\?\.error === "family_verification_unavailable"/);
});

test("les coordonnées ne sont conservées qu'après consentement explicite", () => {
  const storage = memoryStorage();
  const customer = createCustomerStore({ storage, now: () => NOW });
  customer.setField("firstName", "David");
  customer.setField("email", "david@example.test");
  assert.equal(storage.getItem(CUSTOMER_STORAGE_KEY), null);
  customer.setRemember(true);
  const restored = createCustomerStore({ storage, now: () => NOW }).get();
  assert.equal(restored.firstName, "David");
  assert.equal(restored.email, "david@example.test");
  assert.equal(JSON.parse(storage.getItem(CUSTOMER_STORAGE_KEY)).version, 2);
});

test("des coordonnées locales corrompues sont ignorées", () => {
  assert.equal(parseStoredCustomer("{cassé").customer.firstName, "");
  assert.equal(parseStoredCustomer(JSON.stringify({ version: 99, customer: { firstName: "Intrus" } })).customer.firstName, "");
});

test("le retrait conserve les contacts obligatoires mais rend l’adresse facultative", () => {
  assert.deepEqual(requiredCustomerFields("pickup"), ["firstName", "lastName", "email", "phone"]);
  assert.deepEqual(requiredCustomerFields("animoco-light-fr"), [
    "firstName", "lastName", "email", "phone", "address", "postalCode", "city", "country"
  ]);
});

test("les coordonnées ne sont jamais envoyées à cart-quote", () => {
  const payload = buildQuotePayload([{ lineId: "line-1", productId: "animoco", quantity: 1 }], null, null, {
    firstName: "David", email: "david@example.test"
  });
  assert.equal("customer" in payload, false);
  assert.doesNotMatch(JSON.stringify(payload), /David|example\.test/);
});

test("la page affiche l'aide livraison et le consentement de mémorisation", () => {
  assert.ok(cartPage.includes(EMPTY_SHIPPING_MESSAGE));
  assert.match(cartPage, /type="checkbox" data-remember-customer> Enregistrer mes coordonnées/);
  assert.doesNotMatch(cartPage, />Vérifier mes coordonnées<\/button>/);
});

test("le pays est un select stable limité à France et Belgique", () => {
  assert.match(cartPage, /<select name="country"[^>]*>/);
  assert.match(cartPage, /<option value="FR">France<\/option>/);
  assert.match(cartPage, /<option value="BE">Belgique<\/option>/);
  assert.doesNotMatch(cartPage, /<input name="country"/);
});

test("le panier filtre les modes Animoco par pays et présélectionne le pays du mode", () => {
  const modes = ["pickup", "animoco-light-fr", "animoco-light-be", "red-dingo-free"];
  assert.deepEqual(shippingModesForCountry(modes, "FR"), ["pickup", "animoco-light-fr", "red-dingo-free"]);
  assert.deepEqual(shippingModesForCountry(modes, "BE"), ["pickup", "animoco-light-be", "red-dingo-free"]);
  assert.deepEqual(shippingModesForCountry(modes, ""), modes);
  assert.equal(countryForShippingMode("animoco-light-fr"), "FR");
  assert.equal(countryForShippingMode("animoco-light-be"), "BE");
  assert.equal(countryForShippingMode("pickup"), null);
  assert.equal(quoteStatusMessage({ error: "shipping_country_mismatch" }), "Le pays de l’adresse ne correspond pas au mode de livraison choisi. Vérifiez le pays ou choisissez le mode de livraison correspondant.");
});

test("le checkout navigateur ne transmet aucun montant stocké", async () => {
  const payload = buildCheckoutPayload([{
    lineId: "line-1", productId: "animoco", quantity: 1, priceCents: 1,
    options: { chipNumber: "250123456789012", totalCents: 1 }
  }], { mode: "animoco-light-fr", priceCents: 1 }, {
    firstName: "David", lastName: "Test", email: "david@example.test", phone: "0600000000",
    address: "1 rue Test", postalCode: "59000", city: "Lille", country: "FR"
  }, "123e4567-e89b-42d3-a456-426614174000");
  assert.doesNotMatch(JSON.stringify(payload), /priceCents|totalCents/);
  assert.equal(payload.items[0].options.chipNumber, "250123456789012");
  assert.deepEqual(payload.legalAcceptance, { version: "cgv-2026-10-07", accepted: true });

  let request;
  const result = await requestCheckout(payload, { fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, checkoutUrl: "https://checkout.stripe.test/x" }) };
  } });
  assert.equal(request.url, "/api/checkout");
  assert.deepEqual(JSON.parse(request.options.body), payload);
  assert.equal(result.ok, true);
});

test("la page panier propose un consentement explicite avant paiement sans exposer de secret", () => {
  assert.match(cartPage, /data-legal-acceptance/);
  assert.match(cartPage, /data-checkout-button[^>]*>Commander et payer<\/button>/);
  assert.match(cartPage, /obligation de paiement/i);
  assert.doesNotMatch(cartPage, /STRIPE_SECRET_KEY|ORKHAN_SHOP_ORDERS_SECRET/);
});

test("le panier et les coordonnées expirés sont supprimés", () => {
  const oldCart = JSON.stringify({ version: 1, updatedAt: "2026-09-01T00:00:00.000Z", items: [{ lineId: "1", productId: "animoco", quantity: 1 }] });
  assert.deepEqual(parseStoredCart(oldCart, NOW), []);
  const oldCustomer = JSON.stringify({ version: 2, savedAt: "2025-10-01T00:00:00.000Z", customer: { firstName: "David" } });
  assert.equal(parseStoredCustomer(oldCustomer, NOW).customer.firstName, "");
  assert.equal(parseStoredCustomer(JSON.stringify({ version: 2, savedAt: "invalide", customer: { firstName: "David" } }), NOW).customer.firstName, "");
});

test("la clé coordonnées v1 est supprimée au chargement et v2 est effacée au décochage", () => {
  const storage = memoryStorage({ "orkhan-shop-customer-v1": "ancienne" });
  const customer = createCustomerStore({ storage, now: () => NOW });
  assert.equal(storage.getItem("orkhan-shop-customer-v1"), null);
  customer.setRemember(true);
  customer.setField("firstName", "David");
  assert.ok(storage.getItem(CUSTOMER_STORAGE_KEY));
  customer.setRemember(false);
  assert.equal(storage.getItem(CUSTOMER_STORAGE_KEY), null);
});
