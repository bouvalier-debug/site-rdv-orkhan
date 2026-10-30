const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { descriptionHtml } = require("../api/_vitrine");

const attrs = 'target="_blank" rel="noopener noreferrer"';

test("les adresses https:// de la description deviennent des liens ouverts dans un nouvel onglet", () => {
  assert.equal(descriptionHtml("Notice : https://www.exemple.fr/notice.pdf."),
    `<p>Notice : <a href="https://www.exemple.fr/notice.pdf" ${attrs}>https://www.exemple.fr/notice.pdf</a>.</p>`);
  assert.equal(descriptionHtml("Voir (https://exemple.fr/a?x=1&y=2), merci"),
    `<p>Voir (<a href="https://exemple.fr/a?x=1&amp;y=2" ${attrs}>https://exemple.fr/a?x=1&amp;y=2</a>), merci</p>`);
});

test("un lien YouTube reçoit le libellé « Voir la vidéo de démonstration », sans lecteur intégré", () => {
  for (const address of ["https://www.youtube.com/watch?v=abc123", "https://youtu.be/abc123", "https://m.youtube.com/watch?v=abc123"]) {
    const html = descriptionHtml(`Démonstration : ${address}`);
    assert.equal(html, `<p>Démonstration : <a href="${address}" ${attrs}>Voir la vidéo de démonstration</a></p>`);
    assert.doesNotMatch(html, /<iframe/);
  }
  assert.match(descriptionHtml("https://www.youtube.com.exemple.fr/x"), />https:\/\/www\.youtube\.com\.exemple\.fr\/x</);
});

test("les protections contre l'injection HTML restent en place", () => {
  assert.equal(descriptionHtml('https://exemple.fr/"onmouseover="alert(1)'),
    `<p><a href="https://exemple.fr/" ${attrs}>https://exemple.fr/</a>&quot;onmouseover=&quot;alert(1)</p>`);
  assert.equal(descriptionHtml("https://exemple.fr/<script>alert(1)</script>"),
    `<p><a href="https://exemple.fr/" ${attrs}>https://exemple.fr/</a>&lt;script&gt;alert(1)&lt;/script&gt;</p>`);
  for (const text of ["javascript:alert(1)", "http://exemple.fr", "data:text/html,<b>x</b>"]) {
    assert.doesNotMatch(descriptionHtml(text), /<a |<b>/, text);
  }
  assert.equal(descriptionHtml('<a href="https://exemple.fr">x</a>'),
    `<p>&lt;a href=&quot;<a href="https://exemple.fr/" ${attrs}>https://exemple.fr</a>&quot;&gt;x&lt;/a&gt;</p>`);
});

test("paragraphes, intertitres et listes sont conservés, avec des liens dans les listes", () => {
  assert.equal(descriptionHtml("Texte\nsuite\n\nComposition :\n- poulet\n- riz\n\n<b>x</b>"),
    "<p>Texte<br>suite</p><h3>Composition</h3><ul><li>poulet</li><li>riz</li></ul><p>&lt;b&gt;x&lt;/b&gt;</p>");
  assert.equal(descriptionHtml("Ressources :\n- Vidéo https://youtu.be/abc\n- Fiche https://exemple.fr/f"),
    `<h3>Ressources</h3><ul><li>Vidéo <a href="https://youtu.be/abc" ${attrs}>Voir la vidéo de démonstration</a></li>`
      + `<li>Fiche <a href="https://exemple.fr/f" ${attrs}>https://exemple.fr/f</a></li></ul>`);
});

test("les liens longs se coupent sur mobile", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "assets", "vitrine.css"), "utf8");
  assert.match(css, /\.fiche-description a\{[^}]*overflow-wrap:anywhere/);
});
