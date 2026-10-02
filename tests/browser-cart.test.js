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
  parseStoredCart,
  parseStoredCustomer,
  quoteStatusMessage,
  requestQuote,
  requestCheckout,
  requiredCustomerFields
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
  assert.match(quoteStatusMessage(result), /tarifs colis ne sont pas encore disponibles/i);
  assert.match(quoteStatusMessage(result), /Aucun tarif de livraison n’a été appliqué/i);
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
    shipping: { mode: "animoco-light-fr" },
    benefits: { dynastieFamily: true }
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

test("les coordonnées sont conservées localement et restaurées", () => {
  const storage = memoryStorage();
  const customer = createCustomerStore({ storage });
  customer.setField("firstName", "David");
  customer.setField("email", "david@example.test");
  const restored = createCustomerStore({ storage }).get();
  assert.equal(restored.firstName, "David");
  assert.equal(restored.email, "david@example.test");
  assert.equal(JSON.parse(storage.getItem(CUSTOMER_STORAGE_KEY)).version, 1);
});

test("des coordonnées locales corrompues sont ignorées", () => {
  assert.equal(parseStoredCustomer("{cassé").firstName, "");
  assert.equal(parseStoredCustomer(JSON.stringify({ version: 99, customer: { firstName: "Intrus" } })).firstName, "");
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

test("la page affiche l'aide livraison et le nouveau libellé coordonnées", () => {
  assert.ok(cartPage.includes(EMPTY_SHIPPING_MESSAGE));
  assert.match(cartPage, />Enregistrer mes coordonnées<\/button>/);
  assert.doesNotMatch(cartPage, />Vérifier mes coordonnées<\/button>/);
});

test("le pays est un select stable limité à France et Belgique", () => {
  assert.match(cartPage, /<select name="country"[^>]*>/);
  assert.match(cartPage, /<option value="FR">France<\/option>/);
  assert.match(cartPage, /<option value="BE">Belgique<\/option>/);
  assert.doesNotMatch(cartPage, /<input name="country"/);
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

  let request;
  const result = await requestCheckout(payload, { fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, checkoutUrl: "https://checkout.stripe.test/x" }) };
  } });
  assert.equal(request.url, "/api/checkout");
  assert.deepEqual(JSON.parse(request.options.body), payload);
  assert.equal(result.ok, true);
});

test("la page panier propose le paiement sans exposer de secret", () => {
  assert.match(cartPage, /data-checkout-button[^>]*>Payer par carte<\/button>/);
  assert.doesNotMatch(cartPage, /STRIPE_SECRET_KEY|ORKHAN_SHOP_ORDERS_SECRET/);
});
