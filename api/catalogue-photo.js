const { fetchCataloguePhoto } = require("./_orkhan-catalog");

// Relais des photos des produits publiés : le navigateur ne voit ni le Manager, ni le secret, ni le bucket privé.
module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const id = typeof req.query?.id === "string" ? req.query.id : "";
  const photo = await fetchCataloguePhoto(id);
  if (photo.status !== "ok") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(photo.status === "not_found" ? 404 : 503).json({ error: photo.status });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("Content-Length", photo.bytes.length);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.end(photo.bytes);
};
