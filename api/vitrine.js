const { listCatalogue } = require("./_orkhan-catalog");
const { renderAccueil, renderFiche, renderNotFound, renderRayon, renderSurDemande } = require("./_vitrine");

// Phase 6 : accueil, rayons, Sur demande et fiches produit, rendus côté serveur (référencement) et mis en cache
// brièvement au CDN. Les routes publiques sont déclarées dans vercel.json (rewrites).
function send(res, status, html, cacheable) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cacheable ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store");
  return res.status(status).send(html);
}

async function handler(req, res, options = {}) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, renderNotFound(), false);
  const vue = req.query?.vue;
  if (!["accueil", "rayon", "sur-demande", "produit"].includes(vue)) return send(res, 404, renderNotFound(), false);
  const catalogue = await (options.listCatalogue || listCatalogue)();
  const html = vue === "accueil" ? renderAccueil(catalogue)
    : vue === "rayon" ? renderRayon(catalogue, req.query.rayon)
      : vue === "sur-demande" ? renderSurDemande(catalogue)
        : renderFiche(catalogue, req.query.fiche);
  if (!html) return send(res, catalogue.available ? 404 : 503, renderNotFound(), false);
  return send(res, 200, html, catalogue.available);
}

module.exports = handler;
