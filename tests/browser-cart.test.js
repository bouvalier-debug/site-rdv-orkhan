const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  buildQuotePayload,
  createCartStore,
  createCustomerStore,
  parseStoredCart,
  parseStoredCustomer,
  quoteStatusMessage,
  requestQuote,
  requiredCustomerFields
} = require("../assets/cart");

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
