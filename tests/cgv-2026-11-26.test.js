// Étape 2 : CGV cgv-2026-11-26 (prix public unique, Avantage Famille, offres, remboursements) et politique de
// confidentialité. Seuls les passages validés changent ; cgv-2026-10-21-3 reste archivée à l'identique.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SHOP_LEGAL_CURRENT_VERSION } = require("../api/_checkout");
const cart = require("../assets/cart");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const current = require("../legal/cgv-2026-11-26.json");
const previous = require("../legal/cgv-2026-10-21-3.json");
const text = (doc) => JSON.stringify(doc.blocks);

test("version en vigueur cgv-2026-11-26, identique côté panier et serveur ; cgv-2026-10-21-3 archivée sans changement", () => {
  assert.equal(current.version, "cgv-2026-11-26");
  assert.equal(SHOP_LEGAL_CURRENT_VERSION, "cgv-2026-11-26");
  assert.equal(cart.SHOP_LEGAL_CURRENT_VERSION, "cgv-2026-11-26");
  assert.match(current.blocks[1].text, /^\*\*Version cgv-2026-11-26 — validée le 26\/11\/2026, applicable aux commandes passées à compter de sa mise en ligne\*\*$/);
  assert.equal(previous.version, "cgv-2026-10-21-3");
  assert.match(text(previous), /Tarif Famille Dynastie/, "l'ancienne version n'est pas modifiée");
  assert.match(read("conditions-generales-de-vente/cgv-2026-10-21-3/index.html"), /Version cgv-2026-10-21-3 — validée le 21\/10\/2026/);
  assert.match(read("conditions-generales-de-vente/index.html"), /Version du 26 novembre 2026/);
});

test("seuls les passages validés changent (en-tête, 4.2 à 4.5, 5.1, 5.5, 8.8, article 10)", () => {
  const before = new Set(previous.blocks.map((block) => JSON.stringify(block)));
  const added = current.blocks.filter((block) => !before.has(JSON.stringify(block))).map((block) => (block.text || block.items?.[0] || block.head?.[0] || "").slice(0, 40));
  assert.deepEqual(added, [
    "**Version cgv-2026-11-26 — validée le 26",
    "4.2. Prix publics en vigueur à la date d",
    "Produit",
    "4.3. **Avantage Famille Dynastie.** Les ",
    "L'Avantage Famille est accordé après vér",
    "L'Avantage Famille est une remise global",
    "4.4. **Offres promotionnelles « X acheté",
    "**Panachage.** Les produits éligibles à ",
    "4.5. Les frais de livraison éventuels so",
    "il ajoute les produits au panier ; pour ",
    "5.5. **Indisponibilité ou commande ne po",
    "8.8. **Commandes bénéficiant d'une offre",
    "**Rétractation portant sur toute la comm",
    "**Produits acquis dans le cadre d'une of",
    "**Réduction du prix :** lorsque le clien"
  ]);
  const now = new Set(current.blocks.map((block) => JSON.stringify(block)));
  assert.equal(previous.blocks.filter((block) => !now.has(JSON.stringify(block))).length, 7, "en-tête, 4.2, tableau, 4.3, 4.4 (renuméroté), 5.1 et 5.5 remplacés");
});

test("contenu : prix unique, taux non figé, offres, remboursements et garanties", () => {
  const all = text(current);
  assert.doesNotMatch(all, /Tarif Famille|tarif Famille|17,99|\b5 ?%/);
  assert.match(all, /Son taux est celui annoncé sur la Boutique au moment de la commande/);
  assert.match(all, /après déduction des offres promotionnelles \(article 4\.4\)\. Il ne s'applique pas aux frais de livraison/);
  assert.match(all, /autant de fois que le nombre de produits éligibles le permet/);
  assert.match(all, /dans la limite des stocks disponibles/);
  assert.match(all, /sous réserve des conditions et exceptions du droit de rétractation prévues aux articles 8\.1 à 8\.6, notamment pour les médailles gravées Red Dingo/);
  assert.match(all, /2,63 €, 2,63 € et 2,64 €/);
  assert.match(all, /Le vendeur ne réclame aucun complément/);
  assert.match(all, /leur remboursement reste régi par l'article 8\.7 et par les dispositions légales applicables/);
  assert.match(all, /proportionnelle à la différence entre la valeur du bien délivré et la valeur de ce bien en l'absence du défaut de conformité \(article L217-15\)/);
  assert.match(all, /résolution du contrat dans son ensemble dans les cas prévus par la loi/);
  assert.match(all, /articles L217-8 à L217-17/);
  // Ordre : 8.7 puis 8.8, et l'encadré légal de l'article 10 reste intact juste après le paragraphe ajouté.
  const index = (prefix) => current.blocks.findIndex((block) => typeof block.text === "string" && block.text.startsWith(prefix));
  assert.ok(index("8.7. **Remboursement.**") < index("8.8. ") && index("8.8. ") < index("Article 9"));
  const quote = current.blocks.find((block) => block.type === "quote" && JSON.stringify(block).includes("Garantie légale de conformité"));
  assert.deepEqual(quote, previous.blocks.find((block) => block.type === "quote" && JSON.stringify(block).includes("Garantie légale de conformité")));
  assert.equal(current.blocks.find((block) => block.type === "table").rows.length, 3);
});

test("politique de confidentialité : « Avantage Famille » remplace les quatre mentions « tarif Famille »", () => {
  const html = read("confidentialite/index.html");
  assert.doesNotMatch(html, /tarif Famille/i);
  assert.equal((html.match(/Avantage Famille/g) || []).length, 5);
  assert.match(html, /<strong>Avantage Famille Dynastie :<\/strong>/);
  assert.match(html, /Vérifier l'éligibilité à l'Avantage Famille Dynastie/);
});
