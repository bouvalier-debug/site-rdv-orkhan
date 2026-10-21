const fs = require("node:fs");
const path = require("node:path");
const { listCatalogue } = require("./_orkhan-catalog");
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

module.exports = async (req, res, options = {}) => {
  const catalogue = await (options.listCatalogue || listCatalogue)();
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(sitemapXml(fs.readFileSync(BASE, "utf8"), ficheUrls(catalogue)));
};
module.exports.sitemapXml = sitemapXml;
module.exports.ficheUrls = ficheUrls;
