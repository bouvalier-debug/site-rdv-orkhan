const { buildCatalog, isLegacyProductId } = require("./_catalog");
const { listCatalogue } = require("./_orkhan-catalog");

// Phase 7 : correspondance entre les anciens identifiants cosmétiques (paniers enregistrés dans les navigateurs) et les
// produits Artero du catalogue Manager. Une ligne « cosmetics:* » n'est basculée vers le catalogue (prix, stock et
// retrait contrôlés par le Manager) que si le produit correspondant y est ouvert à l'achat ; sinon elle garde son
// parcours historique, inchangé. Les commandes passées conservent leurs identifiants d'origine.
const LEGACY_COSMETICS = Object.freeze({
  "cosmetics:block": "artero-block",
  "cosmetics:bye-bye": "artero-bye-bye-300-ml",
  "cosmetics:samba": "artero-samba",
  "cosmetics:dfender": "artero-dfender",
  "cosmetics:pack-ete": "artero-pack-ete-complet"
});

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

const isLegacyCosmetic = (productId) => Object.hasOwn(LEGACY_COSMETICS, productId);

function migrateLegacyCosmetics(items, products) {
  const byReference = new Map(products.map((product) => [product.reference, product]));
  let changed = false;
  const migrated = items.map((item) => {
    const target = isLegacyCosmetic(item?.productId) ? byReference.get(LEGACY_COSMETICS[item.productId]) : null;
    if (!target || target.purchasable !== true) return item;
    changed = true;
    return { ...item, productId: target.reference };
  });
  return changed ? migrated : items;
}

async function cartCatalog(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const needsCatalogue = list.some((item) => typeof item?.productId === "string" && !isLegacyProductId(item.productId));
  const hasLegacyCosmetics = list.some((item) => isLegacyCosmetic(item?.productId));
  if (!needsCatalogue && !hasLegacyCosmetics) return {};
  const catalogue = await (options.listCatalogue || listCatalogue)(options.catalogueOptions);
  if (!catalogue.available) {
    // Un panier purement historique ne dépend pas du Manager : il garde son parcours actuel si le catalogue est indisponible.
    return needsCatalogue ? { error: "catalogue_unavailable", status: 503 } : {};
  }
  const migrated = migrateLegacyCosmetics(list, catalogue.products);
  return { catalog: buildCatalog(catalogue.products.map(catalogueCartProduct)), ...(migrated !== list ? { items: migrated } : {}) };
}

module.exports = { LEGACY_COSMETICS, cartCatalog, catalogueCartProduct, migrateLegacyCosmetics };
