const { buildCatalog, isLegacyProductId } = require("./_catalog");
const { listCatalogue } = require("./_orkhan-catalog");

// Produits du catalogue Manager pour le devis et la commande (lot 2). Les paniers ne contenant que des produits
// historiques ne déclenchent aucun appel au Manager et gardent leur parcours actuel.
function catalogueCartProduct(product) {
  return {
    id: product.reference,
    name: product.name,
    family: "catalogue",
    catalogue: true,
    catalogueFamily: product.family,
    purchasable: product.purchasable === true,
    publicPriceCents: product.publicPriceCents,
    familyPriceCents: product.familyPriceCents,
    weightGrams: product.weightGrams,
    maxOrderQuantity: product.maxOrderQuantity
  };
}

async function cartCatalog(items, options = {}) {
  const needsCatalogue = Array.isArray(items) && items.some((item) => typeof item?.productId === "string" && !isLegacyProductId(item.productId));
  if (!needsCatalogue) return {};
  const list = await (options.listCatalogue || listCatalogue)(options.catalogueOptions);
  if (!list.available) return { error: "catalogue_unavailable", status: 503 };
  return { catalog: buildCatalog(list.products.map(catalogueCartProduct)) };
}

module.exports = { cartCatalog, catalogueCartProduct };
