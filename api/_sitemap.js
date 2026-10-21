const fs = require("node:fs");
const path = require("node:path");
const { buildFiches } = require("./_vitrine");

// Phase 6 : sitemap de la Boutique = pages fixes (seo/sitemap-boutique.xml) + fiches produit du catalogue Manager.
// Si le catalogue est indisponible, seules les pages fixes sont listées.
const ORIGIN = "https://boutique.dynastiedorkhan.com";
const BASE = path.join(__dirname, "..", "seo", "sitemap-boutique.xml");

function ficheUrls(catalogue) {
  if (!catalogue.available) return [];
  return buildFiches(catalogue.products).map((fiche) => `${ORIGIN}/produits/${encodeURIComponent(fiche.slug)}/`);
}

function sitemapXml(base, urls) {
  const entries = urls.map((url) => `  <url><loc>${url}</loc></url>\n`).join("");
  return base.replace(/\r\n/g, "\n").replace("</urlset>", `${entries}</urlset>`);
}

// Servi par api/vitrine.js (vue=sitemap) : le plan Hobby de Vercel limite le nombre de fonctions par déploiement.
function boutiqueSitemap(catalogue) {
  return sitemapXml(fs.readFileSync(BASE, "utf8"), ficheUrls(catalogue));
}

module.exports = { boutiqueSitemap, ficheUrls, sitemapXml };
