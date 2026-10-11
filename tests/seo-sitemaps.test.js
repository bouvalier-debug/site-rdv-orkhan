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
  assert.deepEqual(config.rewrites, [
    { source: "/sitemap.xml", has: RDV_HOST, destination: "/seo/sitemap-rdv.xml" },
    { source: "/sitemap.xml", destination: "/seo/sitemap-boutique.xml" },
    { source: "/robots.txt", has: RDV_HOST, destination: "/seo/robots-rdv.txt" },
    { source: "/robots.txt", destination: "/seo/robots-boutique.txt" }
  ]);
});

test("le sitemap Boutique ne liste que des pages Boutique publiques et indexables", () => {
  const urls = locs(read("seo/sitemap-boutique.xml"));
  assert.deepEqual(urls, [
    "https://boutique.dynastiedorkhan.com/",
    "https://boutique.dynastiedorkhan.com/medailles-connectees/",
    "https://boutique.dynastiedorkhan.com/cosmetiques/",
    "https://boutique.dynastiedorkhan.com/conditions-generales-de-vente/",
    "https://boutique.dynastiedorkhan.com/renoncer-au-contrat/",
    "https://boutique.dynastiedorkhan.com/mentions-legales/",
    "https://boutique.dynastiedorkhan.com/confidentialite/"
  ]);
  for (const url of urls) {
    const html = read(pageFile(url));
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/i, url);
    assert.doesNotMatch(html, /http-equiv="refresh"/i, url);
  }
  assert.equal(urls.some((url) => /\/panier\/|\/medailles-gravees\/|\/demande-de-rdv\//.test(url)), false);
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

test("l'ancienne route médailles gravées redirige en 308 vers la page des médailles gravées", () => {
  const routes = config.redirects.filter((entry) => entry.source === "/medailles-gravees" || entry.source === "/medailles-gravees/");
  assert.deepEqual(routes, [
    { source: "/medailles-gravees", has: RDV_HOST, destination: "https://boutique.dynastiedorkhan.com/", permanent: true },
    { source: "/medailles-gravees/", has: RDV_HOST, destination: "https://boutique.dynastiedorkhan.com/", permanent: true },
    { source: "/medailles-gravees", destination: "/", permanent: true },
    { source: "/medailles-gravees/", destination: "/", permanent: true }
  ]);
  const firstGeneric = config.redirects.findIndex((entry) => entry.source.startsWith("/medailles-gravees") && !entry.has);
  const lastRdv = config.redirects.findLastIndex((entry) => entry.source.startsWith("/medailles-gravees") && entry.has);
  assert.ok(lastRdv < firstGeneric, "les règles RDV doivent précéder la règle générique");
  assert.match(read("index.html"), /<h1>Médailles gravées Red Dingo<\/h1>/);
});

test("les ressources du catalogue Red Dingo restent servies sous /medailles-gravees/", () => {
  assert.match(read("index.html"), /src="\/medailles-gravees\/\$\{encodeURI\(model\.image\)\}"/);
  for (const entry of config.redirects.filter((item) => item.source.startsWith("/medailles-gravees"))) {
    assert.doesNotMatch(entry.source, /[:*(]/, entry.source);
  }
});
