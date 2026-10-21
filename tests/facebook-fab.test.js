const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const fab = /<a class="facebook-fab" href="https:\/\/www\.facebook\.com\/dynastiedorkhan" target="_blank" rel="noopener noreferrer" aria-label="[^"]+">/g;

test("les pages Boutique affichent un seul bouton Facebook partagé", () => {
  for (const file of ["medailles-gravees/index.html", "cosmetiques/index.html", "medailles-connectees/index.html", "demande-de-rdv/index.html", "conditions-generales-de-vente/index.html", "confidentialite/index.html", "mentions-legales/index.html", "renoncer-au-contrat/index.html"]) {
    const html = read(file);
    assert.equal((html.match(fab) || []).length, 1, file);
    assert.match(html, /href="\/assets\/orkhan-design\.css"/, `${file} charge le style partagé`);
  }
});

test("le bouton Facebook est masqué pendant la commande (K5)", () => {
  for (const file of ["panier/index.html", "panier/confirmation/index.html"]) assert.doesNotMatch(read(file), /facebook-fab/, file);
});

test("le générateur des CGV conserve le bouton Facebook, sans le placer dans la version archivée", () => {
  const { pageHtml } = require("../scripts/build-legal-pages");
  const archive = require("../legal/cgv-2026-10-05.json");
  assert.equal((pageHtml().match(fab) || []).length, 1);
  assert.match(pageHtml(), /<\/footer><a class="facebook-fab"[^\n]*<\/a><button id="to-top"[^\n]*<\/script><\/body><\/html>\n$/, "boutons placés après le pied de page, comme sur la page publiée");
  assert.doesNotMatch(pageHtml(archive), /facebook-fab/);
});
