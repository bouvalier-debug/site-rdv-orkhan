const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const css = read("assets/orkhan-design.css");

test("les bannières en 100vw ne dépassent plus grâce à la gouttière stable", () => {
  assert.match(css, /html\{scroll-behavior:smooth;scrollbar-gutter:stable\}/);
  assert.match(css, /body\{margin:0;overflow-x:clip;/, "le clip existant est conservé, il ne sert plus à masquer un dépassement");
});

test("la navigation Boutique peut aller à la ligne sur tablette", () => {
  assert.match(css, /@media\(min-width:701px\) and \(max-width:959px\)\{\s*body:not\(:has\(> \.ecosystem-nav\)\) main>\.site-nav:first-of-type\{display:flex;height:auto;max-width:100%;flex-wrap:wrap;/);
});

test("la page RDV propose un retour explicite vers le site de l’élevage, avant la bannière", () => {
  const html = read("demande-de-rdv/index.html");
  const back = html.indexOf('<a class="shop-return" href="https://www.dynastiedorkhan.com/">← Retour au site de l’élevage</a>');
  assert.ok(back > html.indexOf('<nav class="ecosystem-nav"'), "après la navigation");
  assert.ok(back < html.indexOf("<header>"), "avant la bannière");
  assert.equal((html.match(/class="shop-return"/g) || []).length, 1);
});

test("la page Cosmétiques renvoie aussi vers la boutique, comme la médaille connectée", () => {
  for (const file of ["cosmetiques/index.html", "medailles-connectees/index.html"]) {
    assert.match(read(file), /<p><a href="\/">Retour à la boutique<\/a><\/p>/, file);
  }
});

test("les caractéristiques des médailles connectées passent sur une colonne entre 851 et 1023 px", () => {
  const styles = read("medailles-connectees/styles.css");
  assert.match(styles, /@media\(min-width:851px\) and \(max-width:1023px\)\{\.specs\{grid-template-columns:1fr\}\}/);
  assert.match(styles, /\.specs\{grid-template-columns:repeat\(2,1fr\)/, "deux colonnes conservées au-delà");
});

test("le menu Boutique propose « Nouveautés » après « Cosmétiques », actif seulement sur /nouveautes/", () => {
  const pages = { "index.html": false, "cosmetiques/index.html": false, "medailles-connectees/index.html": false, "nouveautes/index.html": true };
  for (const [file, active] of Object.entries(pages)) {
    const nav = read(file).match(/<nav class="site-nav shop-nav"[^>]*>.*?<\/nav>/s)[0];
    assert.equal((nav.match(/href="\/nouveautes\/"/g) || []).length, 1, file);
    assert.ok(nav.indexOf('href="/nouveautes/"') > nav.indexOf('href="/cosmetiques/"'), `${file} : après Cosmétiques`);
    assert.ok(nav.indexOf('href="/nouveautes/"') < nav.indexOf('href="/panier/"'), `${file} : avant le panier`);
    assert.equal(/class="active" aria-current="page" href="\/nouveautes\/"/.test(nav), active, `${file} : état actif`);
  }
  assert.match(read("nouveautes/index.html"), /<meta name="robots" content="noindex">/, "page toujours non indexée pendant le lot 1");
});
