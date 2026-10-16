const { listCatalogue } = require("./_orkhan-catalog");

// Nouveautés du catalogue Manager (lot 1) : produits publiés, affichés à titre informatif, jamais achetables.
module.exports = async (req, res) => {
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const catalogue = await listCatalogue();
  res.setHeader("Cache-Control", catalogue.available ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store");
  return res.status(200).json(catalogue);
};
