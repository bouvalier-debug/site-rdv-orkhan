const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SHOP_FOOTER, BACK_TO_TOP } = require("../scripts/shop-layout");
const { pageHtml } = require("../scripts/build-legal-pages");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const SHOP_PAGES = [
  "index.html", "nouveautes/index.html", "cosmetiques/index.html", "medailles-connectees/index.html", "panier/index.html",
  "panier/confirmation/index.html", "conditions-generales-de-vente/index.html", "confidentialite/index.html",
  "mentions-legales/index.html", "renoncer-au-contrat/index.html"
];

test("D1 : toutes les pages Boutique reprennent le même pied de page", () => {
  for (const file of SHOP_PAGES) {
    const html = read(file);
    assert.equal((html.match(/<footer/g) || []).length, 1, file);
    assert.ok(html.includes(SHOP_FOOTER), file);
  }
  for (const term of ["52 rue de Masny", "SIRET", "tel:+33327990364", "mailto:contact@dynastiedorkhan.com", "/conditions-generales-de-vente/", "/mentions-legales/", "/confidentialite/", "/renoncer-au-contrat/"]) {
    assert.ok(SHOP_FOOTER.includes(term), term);
  }
});

test("K5 : un seul bouton « Retour en haut » sur les pages Boutique longues", () => {
  for (const file of SHOP_PAGES.filter((page) => page !== "panier/confirmation/index.html")) {
    assert.equal((read(file).match(/id="to-top"/g) || []).length, 1, file);
  }
  assert.ok(pageHtml().includes(BACK_TO_TOP));
});

test("K6 : la page CGV affiche une date lisible sans changer l'identifiant enregistré ni l'archive", () => {
  const html = read("conditions-generales-de-vente/index.html");
  // Phase 5 : version du 22 octobre 2026 ; les versions précédentes restent archivées.
  assert.match(html, /<strong>Version du 22 octobre 2026, applicable aux commandes passées à compter de sa mise en ligne<\/strong>/);
  assert.doesNotMatch(html, /cgv-phase5-projet|cgv-2026-10-21|cgv-2026-10-07/);
  assert.match(read("conditions-generales-de-vente/cgv-2026-10-21/index.html"), /Version cgv-2026-10-21 — validée le 21\/10\/2026/);
  assert.equal(require("../legal/cgv-2026-10-07.json").version, "cgv-2026-10-07");
  assert.match(read("conditions-generales-de-vente/cgv-2026-10-05/index.html"), /Version cgv-2026-10-05 — validée le 05\/10\/2026/);
  assert.match(read("conditions-generales-de-vente/cgv-2026-10-07/index.html"), /Version cgv-2026-10-07 — validée le 07\/10\/2026/);
});

test("K6 et P4 : plus de formulations techniques ni saisonnières visibles", () => {
  for (const file of ["panier/index.html", "medailles-connectees/index.html"]) {
    assert.doesNotMatch(read(file), /côté serveur|par le serveur|par notre serveur|<code>cgv-/, file);
  }
  const cosmetics = read("cosmetiques/index.html");
  assert.doesNotMatch(cosmetics, /d'été|l'été|estival/);
  assert.match(cosmetics, /Pack Été complet/);
  assert.match(cosmetics, /id:'pack-ete'/);
});

test("K3 : la politique de confidentialité ne mentionne plus l'option et garde les autres données locales", () => {
  const html = read("confidentialite/index.html");
  assert.doesNotMatch(html, /Enregistrer mes coordonnées|Coordonnées enregistrées/);
  assert.match(html, /<li><strong>Panier :<\/strong>[^<]*30 jours après sa dernière modification\.<\/li><\/ul><br><ul><li><strong>Cookie technique de paiement :<\/strong>/);
});
