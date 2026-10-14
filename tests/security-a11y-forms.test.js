const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("les en-têtes de sécurité s'appliquent à toutes les routes, CSP en mode Report-Only", () => {
  const { headers } = JSON.parse(read("vercel.json"));
  assert.equal(headers.length, 1);
  assert.equal(headers[0].source, "/(.*)");
  const byKey = Object.fromEntries(headers[0].headers.map((h) => [h.key, h.value]));
  assert.equal(byKey["Content-Security-Policy"], undefined, "pas de CSP bloquante");
  assert.match(byKey["Content-Security-Policy-Report-Only"], /frame-src https:\/\/player\.vimeo\.com/);
  assert.match(byKey["Content-Security-Policy-Report-Only"], /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.doesNotMatch(byKey["Content-Security-Policy-Report-Only"], /report-uri|report-to/, "aucune collecte de rapports");
  assert.equal(byKey["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(byKey["X-Content-Type-Options"], "nosniff");
  assert.equal(byKey["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(byKey["Strict-Transport-Security"], undefined, "HSTS reste géré par Vercel");
});

test("le formulaire RDV déclare l'autocomplete sans changer les noms ni les champs requis", () => {
  const html = read("demande-de-rdv/index.html");
  assert.match(html, /<input type="text" id="nom" name="nom-prenom" autocomplete="name" required \/>/);
  assert.match(html, /<input type="tel" id="telephone" name="telephone" autocomplete="tel" required \/>/);
  assert.match(html, /<input type="email" id="email" name="email" autocomplete="email" required \/>/);
});

test("les liens et commandes isolés offrent une zone tactile de 44 px", () => {
  const css = read("assets/orkhan-design.css");
  assert.match(css, /\.shop-return,\.cart-nav>a\{display:inline-flex;align-items:center;min-height:44px\}/);
  assert.match(css, /\.site-footer p a,body>footer p a\{display:inline-block;padding-block:11px\}/);
});
