const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const config = JSON.parse(read("vercel.json"));
const RDV_HOST = [{ type: "host", value: "rdv.dynastiedorkhan.com" }];

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const pageFile = (url) => path.join(new URL(url).pathname.replace(/^\//, ""), "index.html");

test("aucun sitemap ni robots partagé ne masque les réécritures par hôte", () => {
  assert.equal(fs.existsSync(path.join(root, "sitemap.xml")), false);
  assert.equal(fs.existsSync(path.join(root, "robots.txt")), false);
});

test("sitemap.xml et robots.txt sont servis selon l'hôte, Boutique par défaut", () => {
  // Phase 6 : les réécritures de la vitrine (accueil, rayons, Sur demande, fiches) précèdent celles du SEO.
  assert.deepEqual(config.rewrites.filter((rewrite) => !rewrite.destination.startsWith("/api/vitrine?") || rewrite.source === "/sitemap.xml"), [
    { source: "/sitemap.xml", has: RDV_HOST, destination: "/seo/sitemap-rdv.xml" },
    { source: "/sitemap.xml", destination: "/api/vitrine?vue=sitemap" },
    { source: "/robots.txt", has: RDV_HOST, destination: "/seo/robots-rdv.txt" },
    { source: "/robots.txt", destination: "/seo/robots-boutique.txt" }
  ]);
});

test("le sitemap Boutique ne liste que des pages Boutique publiques et indexables", () => {
  const urls = locs(read("seo/sitemap-boutique.xml"));
  const { RAYONS } = require("../scripts/shop-layout");
  // Phase 6 : accueil, rayons et Sur demande sont rendus côté serveur (réécritures vers /api/vitrine) ; les autres
  // pages sont des fichiers statiques.
  const vitrine = ["https://boutique.dynastiedorkhan.com/", "https://boutique.dynastiedorkhan.com/nouveautes/", ...RAYONS.map((rayon) => `https://boutique.dynastiedorkhan.com/rayons/${rayon.slug}/`), "https://boutique.dynastiedorkhan.com/sur-demande/"];
  assert.deepEqual(urls, [
    ...vitrine,
    "https://boutique.dynastiedorkhan.com/medailles-gravees/",
    "https://boutique.dynastiedorkhan.com/medailles-connectees/",
    "https://boutique.dynastiedorkhan.com/conditions-generales-de-vente/",
    "https://boutique.dynastiedorkhan.com/renoncer-au-contrat/",
    "https://boutique.dynastiedorkhan.com/mentions-legales/",
    "https://boutique.dynastiedorkhan.com/confidentialite/"
  ]);
  for (const url of urls.filter((item) => !vitrine.includes(item))) {
    const html = read(pageFile(url));
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/i, url);
    assert.doesNotMatch(html, /http-equiv="refresh"/i, url);
  }
  assert.equal(fs.existsSync(path.join(root, "index.html")), false, "l'accueil n'est plus un fichier statique");
  assert.equal(urls.some((url) => /\/panier\/|\/demande-de-rdv\//.test(url)), false);
});

test("le sitemap RDV ne liste que la demande de rendez-vous", () => {
  const urls = locs(read("seo/sitemap-rdv.xml"));
  assert.deepEqual(urls, ["https://rdv.dynastiedorkhan.com/demande-de-rdv/"]);
  assert.doesNotMatch(read(pageFile(urls[0])), /<meta name="robots" content="[^"]*noindex/i);
});

test("chaque robots.txt annonce son propre sitemap et exclut le panier", () => {
  for (const [file, host] of [["seo/robots-boutique.txt", "boutique"], ["seo/robots-rdv.txt", "rdv"]]) {
    const robots = read(file);
    assert.match(robots, new RegExp(`^Sitemap: https://${host}\\.dynastiedorkhan\\.com/sitemap\\.xml$`, "m"));
    assert.match(robots, /^Disallow: \/api\/$/m);
    assert.match(robots, /^Disallow: \/panier\/$/m);
    assert.doesNotMatch(robots, /www\.dynastiedorkhan\.com/);
  }
});

test("phase 6 : la page Red Dingo est servie sur /medailles-gravees/, sans redirection vers l'accueil ni boucle", () => {
  const routes = config.redirects.filter((entry) => entry.source === "/medailles-gravees" || entry.source === "/medailles-gravees/");
  assert.deepEqual(routes, [
    { source: "/medailles-gravees", has: RDV_HOST, destination: "https://boutique.dynastiedorkhan.com/medailles-gravees/", permanent: true },
    { source: "/medailles-gravees/", has: RDV_HOST, destination: "https://boutique.dynastiedorkhan.com/medailles-gravees/", permanent: true }
  ]);
  assert.equal(config.redirects.some((entry) => entry.source.startsWith("/medailles-gravees") && !entry.has && entry.destination === "/"), false);
  const html = read("medailles-gravees/index.html");
  assert.match(html, /<h1>Médailles gravées Red Dingo<\/h1>/);
  assert.ok(html.includes('<link rel="canonical" href="https://boutique.dynastiedorkhan.com/medailles-gravees/">'));
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  for (const source of ["/nouveautes", "/nouveautes/"]) {
    assert.equal(config.redirects.some((entry) => entry.source === source), false);
    assert.deepEqual(config.rewrites.find((entry) => entry.source === source), { source, destination: "/api/vitrine?vue=nouveautes" });
  }
});

test("les ressources du catalogue Red Dingo restent servies sous /medailles-gravees/", () => {
  assert.match(read("medailles-gravees/index.html"), /src="\/medailles-gravees\/\$\{encodeURI\(model\.image\)\}"/);
  for (const entry of config.redirects.filter((item) => item.source.startsWith("/medailles-gravees"))) {
    assert.doesNotMatch(entry.source, /[:*(]/, entry.source);
  }
});
