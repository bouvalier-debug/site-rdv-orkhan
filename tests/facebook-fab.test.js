const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const fab = /<a class="facebook-fab" href="https:\/\/www\.facebook\.com\/dynastiedorkhan" target="_blank" rel="noopener noreferrer" aria-label="[^"]+">/g;

test("les pages Boutique affichent un seul bouton Facebook partagé", () => {
  for (const file of ["index.html", "cosmetiques/index.html", "medailles-connectees/index.html", "demande-de-rdv/index.html", "panier/index.html", "conditions-generales-de-vente/index.html", "confidentialite/index.html", "mentions-legales/index.html", "renoncer-au-contrat/index.html"]) {
    const html = read(file);
    assert.equal((html.match(fab) || []).length, 1, file);
    assert.match(html, /href="\/assets\/orkhan-design\.css"/, `${file} charge le style partagé`);
  }
});

test("le générateur des CGV conserve le bouton Facebook, sans le placer dans la version archivée", () => {
  const { pageHtml } = require("../scripts/build-legal-pages");
  const archive = require("../legal/cgv-2026-10-05.json");
  assert.equal((pageHtml().match(fab) || []).length, 1);
  assert.match(pageHtml(), /<\/footer><a class="facebook-fab"[^\n]*<\/a><\/body><\/html>\n$/, "bouton placé après le pied de page, comme sur la page publiée");
  assert.doesNotMatch(pageHtml(archive), /facebook-fab/);
});
