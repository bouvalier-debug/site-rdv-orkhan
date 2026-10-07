const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildCatalog } = require("../api/_catalog");
const { quoteCart } = require("../api/_cart");
const { createCartStore, buildQuotePayload } = require("../assets/cart");
const { addLine, animocoLine, cosmeticLine, redDingoLine, showAddConfirmation } = require("../assets/product-cart");

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

test("ajoute et chiffre un modèle Red Dingo sans couleur", () => {
  const line = redDingoLine({ reference: "01-DR", size: "M", colour: "", frontEngraving: "NALA", quantity: 2 });
  assert.equal(line.options.colour, "");
  const result = quoteCart({ items: [line], shipping: { mode: "pickup" } });
  assert.equal(result.quote.totalCents, 3390);
  assert.equal(result.quote.lines[0].options.colour, "");
});

test("le serveur refuse toujours une couleur pour un modèle Red Dingo sans couleur", () => {
  const line = redDingoLine({ reference: "01-DR", size: "M", colour: "Rouge", frontEngraving: "NALA", quantity: 1 });
  assert.equal(quoteCart({ items: [line] }).error, "red_dingo_invalid_colour");
});

test("les modèles Red Dingo à choix ou à couleur imposée restent inchangés", () => {
  const elevenColours = redDingoLine({ reference: "01-BN", size: "M", colour: "Black", frontEngraving: "NALA", quantity: 1 });
  const imposedColour = redDingoLine({ reference: "01-AN", size: "M", colour: "Dark Blue", frontEngraving: "NALA", quantity: 1 });
  assert.equal(quoteCart({ items: [elevenColours] }).quote.lines[0].options.colour, "Black");
  assert.equal(quoteCart({ items: [imposedColour] }).quote.lines[0].options.colour, "Dark Blue");
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

test("le formulaire Red Dingo masque sans exiger la couleur quand le modèle n'en propose aucune", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /else if\(model&&!model\.color\)/);
  assert.match(html, /<input type="hidden" name="couleur" id="color" value="">/);
  assert.match(html, /La couleur est propre à ce modèle : aucun choix n’est nécessaire\./);
  assert.match(html, /<select name="couleur" id="color" required>/);
  assert.match(html, /<input name="couleur" id="color" required placeholder="Ex\. bleu foncé">/);
});

test("les anciens parcours directs ont été retirés au profit du panier commun", () => {
  const redDingo = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const animoco = fs.readFileSync(path.join(__dirname, "..", "medailles-connectees/index.html"), "utf8");
  const cosmetics = fs.readFileSync(path.join(__dirname, "..", "cosmetiques/index.html"), "utf8");
  assert.doesNotMatch(redDingo, /\/api\/medaille-webhook/);
  assert.doesNotMatch(animoco, /id="connected-order"/);
  assert.doesNotMatch(cosmetics, /id="send-request"/);
  assert.match(redDingo, /Commander et payer/);
  assert.match(animoco, /Ajouter au panier/);
  assert.match(cosmetics, /Ajouter au panier/);
});

test("le bouton de vérification de puce garde un texte avant, pendant et après", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "medailles-connectees", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "..", "medailles-connectees", "order.js"), "utf8");
  assert.match(html, /id="verify-family-chip"[^>]*>Vérifier la puce<\/button><p class="family-status/);
  assert.match(script, /verifyButton\.textContent="Vérification…"/);
  assert.match(script, /finally\{verifyButton\.disabled=false;verifyButton\.textContent="Vérifier la puce"\}/);
  assert.doesNotMatch(script, /verifyButton\.textContent=""/);
});

test("la confirmation d'ajout mutualisée apparaît sous le bouton avec le lien panier", () => {
  const document = {
    createElement(tag) {
      return {
        tag, children: [], hidden: true,
        setAttribute(name, value) { this[name] = value; },
        replaceChildren(...children) { this.children = children; },
        append(...children) { this.children.push(...children); }
      };
    },
    createTextNode(text) { return { text }; }
  };
  const button = { ownerDocument: document, insertAdjacentElement(position, node) { this.position = position; this.confirmation = node; } };
  const node = showAddConfirmation(button, "Produit ajouté au panier.");
  assert.equal(button.position, "afterend");
  assert.equal(node.role, "status");
  assert.equal(node.hidden, false);
  assert.equal(node.children[1].href, "/panier/");
  assert.equal(node.children[1].textContent, "Voir mon panier");
});

test("les trois pages utilisent la confirmation mutualisée avec leur libellé", () => {
  const redDingo = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const animoco = fs.readFileSync(path.join(__dirname, "..", "medailles-connectees", "order.js"), "utf8");
  const cosmetics = fs.readFileSync(path.join(__dirname, "..", "cosmetiques", "index.html"), "utf8");
  assert.match(redDingo, /showAddConfirmation\(event\.currentTarget,'Médaille Red Dingo ajoutée au panier\.',message\)/);
  assert.match(animoco, /showAddConfirmation\(event\.currentTarget,"Médaille Animoco ajoutée au panier\.",message\)/);
  assert.match(cosmetics, /showAddConfirmation\(button,`\$\{product\.name\} ajouté au panier\.`\)/);
});
