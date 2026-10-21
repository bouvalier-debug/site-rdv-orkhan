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

test("phase 6 (L2) : la page RDV reprend le menu du site principal, bouton Boutique doré, sans « Retour au site » en doublon", () => {
  const html = read("demande-de-rdv/index.html");
  const nav = html.match(/<nav class="ecosystem-nav"[^>]*>(.*?)<\/nav>/s)[1];
  assert.deepEqual([...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]), ["Accueil", "L’élevage", "Conseils", "Outils", "Le Journal", "PuppyPass", "Contact", "Boutique", "Prendre rendez-vous"]);
  assert.match(nav, /<a class="nav-shop" href="https:\/\/boutique\.dynastiedorkhan\.com\/">Boutique<\/a>/, "plus de lien « / » qui renvoyait vers la page RDV elle-même");
  assert.match(nav, /<a href="\/demande-de-rdv\/" aria-current="page">Prendre rendez-vous<\/a>/);
  assert.doesNotMatch(html, /class="shop-return"|Retour au site de l’élevage/);
  assert.match(html, /<nav class="footer-links"[^>]*>.*https:\/\/boutique\.dynastiedorkhan\.com\/.*Mentions légales/s);
  assert.match(css, /\.ecosystem-nav a\.nav-shop\{order:5;[^}]*background:var\(--gold\)/);
  assert.equal((html.match(/<form/g) || []).length, 1, "formulaire de rendez-vous inchangé");
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

test("phase 6 : menu Boutique « Accueil | Rayons | Panier | Contact », sans Rendez-vous ni Nouveautés", () => {
  const { RAYONS, SHOP_HEADER } = require("../scripts/shop-layout");
  const labels = [...SHOP_HEADER.matchAll(/<nav class="shop-menu"[^>]*>(.*)<\/nav>/gs)][0][1];
  assert.deepEqual([...labels.matchAll(/<(?:a [^>]*|summary)>([^<]+)/g)].map((match) => match[1].trim()).filter((label) => ["Accueil", "Rayons", "Panier", "Contact"].includes(label)), ["Accueil", "Rayons", "Panier", "Contact"]);
  assert.deepEqual(RAYONS.map((rayon) => rayon.label), ["Alimentation", "Sellerie", "Identification", "Jouets", "Accessoires", "Hygiène et soins"]);
  for (const rayon of RAYONS) assert.ok(SHOP_HEADER.includes(`<a href="/rayons/${rayon.slug}/">${rayon.label}</a>`), rayon.label);
  assert.doesNotMatch(SHOP_HEADER, /demande-de-rdv|Rendez-vous|nouveautes/);
  assert.match(SHOP_HEADER, /<details class="shop-rayons"><summary>Rayons<\/summary>/, "ouverture au clic, au clavier et au toucher");
  assert.match(css, /\.shop-menu>a,\.shop-rayons>summary\{[^}]*min-height:44px/, "cibles tactiles d’au moins 44 px");
});
