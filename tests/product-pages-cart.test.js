const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildCatalog } = require("../api/_catalog");
const { createCartStore, buildQuotePayload } = require("../assets/cart");
const { addLine, animocoLine, cosmeticLine, redDingoLine } = require("../assets/product-cart");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function store() {
  let id = 0;
  return createCartStore({ storage: memoryStorage(), idFactory: () => `product-line-${++id}` });
}

test("ajoute un Animoco avec quantité", () => {
  const cart = store();
  addLine(cart, animocoLine({ quantity: 3 }));
  assert.deepEqual(cart.getItems()[0], { lineId: "product-line-1", productId: "animoco", quantity: 3 });
  assert.equal(cart.count(), 3);
});

test("ajoute un Animoco avec puce sans prix navigateur", () => {
  const line = animocoLine({ quantity: 1, chipNumber: "250 123 456 789 012", familyEligible: true, priceCents: 1 });
  assert.deepEqual(line, {
    productId: "animoco", quantity: 1,
    options: { chipNumber: "250 123 456 789 012", familyEligible: true }
  });
  assert.doesNotMatch(JSON.stringify(line), /price/i);
});

test("ajoute une Red Dingo simple face", () => {
  assert.deepEqual(redDingoLine({
    reference: "01-BN", size: "s", colour: "Black", frontEngraving: "NALA\n0600000000", quantity: 1,
    doubleSided: false, price: 0.01
  }), {
    productId: "red-dingo:01-BN", quantity: 1,
    options: { size: "S", colour: "Black", frontLines: ["NALA", "0600000000"] }
  });
});

test("ajoute une Red Dingo double face quand le modèle l'autorise", () => {
  const line = redDingoLine({ reference: "02-HT", size: "M", colour: "", frontEngraving: "NALA",
    backEngraving: "TEL\nADRESSE", doubleSided: true, quantity: 1 });
  assert.deepEqual(line.options.backLines, ["TEL", "ADRESSE"]);
  assert.throws(() => redDingoLine({ reference: "01-BN", size: "S", frontEngraving: "NALA",
    backEngraving: "TEL", doubleSided: false, quantity: 1 }), /red_dingo_back_not_allowed/);
});

test("deux Red Dingo personnalisées restent deux lignes", () => {
  const cart = store();
  addLine(cart, redDingoLine({ reference: "01-BN", size: "S", colour: "Black", frontEngraving: "NALA", quantity: 1 }));
  addLine(cart, redDingoLine({ reference: "01-BN", size: "S", colour: "Black", frontEngraving: "ORKHAN", quantity: 1 }));
  assert.equal(cart.getItems().length, 2);
  assert.notDeepEqual(cart.getItems()[0].options, cart.getItems()[1].options);
});

test("ajoute un cosmétique connu du catalogue serveur", () => {
  const line = cosmeticLine("block", 2);
  assert.deepEqual(line, { productId: "cosmetics:block", quantity: 2 });
  assert.equal(buildCatalog().get(line.productId).priceCents, 2140);
});

test("les lignes pages produits ne transmettent aucun prix au devis", () => {
  const payload = buildQuotePayload([
    { lineId: "1", ...cosmeticLine("dfender", 1), priceCents: 1 },
    { lineId: "2", ...animocoLine({ quantity: 1 }), totalCents: 1 }
  ]);
  assert.doesNotMatch(JSON.stringify(payload), /price|total/i);
});

test("les trois pages chargent le panier commun et affichent son compteur", () => {
  for (const file of ["index.html", "medailles-connectees/index.html", "cosmetiques/index.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(html, /\/assets\/cart\.js/);
    assert.match(html, /data-cart-count/);
    assert.match(html, /href="\/panier\/"/);
  }
});

test("les anciens endpoints et formulaires restent présents", () => {
  const redDingo = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const animoco = fs.readFileSync(path.join(__dirname, "..", "medailles-connectees/index.html"), "utf8");
  const cosmetics = fs.readFileSync(path.join(__dirname, "..", "cosmetiques/index.html"), "utf8");
  assert.match(redDingo, /\/api\/medaille-webhook/);
  assert.match(animoco, /id="connected-order"/);
  assert.match(cosmetics, /id="send-request"/);
});
