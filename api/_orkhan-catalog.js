const { endpoint } = require("./_orkhan-shop-orders");

// Lecture du catalogue administré dans Orkhan Manager, uniquement côté serveur.
// Le secret Boutique ne quitte jamais ce module : il n'est ni renvoyé au navigateur, ni journalisé.
// Lot 2 : un produit n'est achetable que si le Manager l'indique (verrou levé, produit ouvert à l'achat). Le Manager
// reste seul juge des prix et du stock : il recontrôle tout à la création de la commande.

const REQUEST_TIMEOUT_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGER_PHOTO_PATH = /^\/api\/shop-catalog\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const FAMILIES = new Set(["ANIMOCO", "RED_DINGO", "COLIS", "CROQUETTES"]);
const MAX_PRICE_CENTS = 10_000_000;
const MAX_ORDER_QUANTITY = 20;
const MAX_WEIGHT_GRAMS = 100_000;
// Phase 3 : référentiel des rayons et états de disponibilité calculés par le Manager.
const SHELVES = new Set(["ALIMENTATION", "SELLERIE", "IDENTIFICATION", "JOUETS", "ACCESSOIRES", "HYGIENE_SOINS"]);
const AVAILABILITIES = new Set(["in_stock", "low_stock", "out_of_stock", "on_request"]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function configuration(options = {}) {
  const baseUrl = options.baseUrl || process.env.ORKHAN_MANAGER_URL;
  const secret = options.secret || process.env.ORKHAN_SHOP_ORDERS_SECRET;
  const vercelBypassSecret = options.vercelBypassSecret || process.env.ORKHAN_MANAGER_VERCEL_BYPASS_SECRET;
  if (!baseUrl || !secret) throw new Error("orkhan_catalog_not_configured");
  return { baseUrl, secret, vercelBypassSecret, fetch: options.fetch || fetch, timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS };
}

async function managerGet(config, pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await config.fetch(endpoint(config.baseUrl, pathname), {
      method: "GET",
      headers: {
        "X-Orkhan-Shop-Orders-Secret": config.secret,
        ...(config.vercelBypassSecret ? { "x-vercel-protection-bypass": config.vercelBypassSecret } : {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function text(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE_CENTS ? value : null;
}

// Liste blanche des champs affichés : tout autre champ renvoyé par le Manager est ignoré.
function publicProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const reference = text(raw.reference, 80);
  const name = text(raw.name, 200);
  const publicPriceCents = cents(raw.publicPriceCents);
  if (!reference || !name || publicPriceCents === null) return null;
  // Achetable uniquement sur indication explicite du Manager, pour une famille vendable et un prix non nul.
  // Familles vendables : les mêmes que dans le Manager (CATALOG_SELLABLE_FAMILIES) ; Red Dingo reste exclu.
  const maxOrderQuantity = Number.isSafeInteger(raw.maxOrderQuantity) ? Math.min(Math.max(raw.maxOrderQuantity, 0), MAX_ORDER_QUANTITY) : 0;
  // Phase 3 (CAT-09) : un produit « Sur demande » n'est jamais achetable, quoi qu'indique le reste de la réponse.
  const onRequest = raw.onRequest === true;
  const purchasable = raw.purchasable === true && !onRequest && ["COLIS", "ANIMOCO", "CROQUETTES"].includes(raw.family) && publicPriceCents > 0;
  const shelf = SHELVES.has(raw.shelf) ? raw.shelf : null;
  const variantGroup = typeof raw.variantGroup === "string" && raw.variantGroup.length <= 80 && SLUG.test(raw.variantGroup) ? raw.variantGroup : null;
  const photos = (Array.isArray(raw.photos) ? raw.photos : []).map((photo) => {
    const match = typeof photo?.url === "string" ? photo.url.match(MANAGER_PHOTO_PATH) : null;
    if (!match) return null;
    return {
      url: `/api/catalogue-photo?id=${match[1].toLowerCase()}`,
      width: Number.isSafeInteger(photo.width) ? photo.width : null,
      height: Number.isSafeInteger(photo.height) ? photo.height : null,
      altText: text(photo.altText, 300) || name
    };
  }).filter(Boolean);
  return {
    reference,
    name,
    family: FAMILIES.has(raw.family) ? raw.family : null,
    description: text(raw.description, 5000),
    publicPriceCents,
    familyPriceCents: raw.familyPriceCents === null || raw.familyPriceCents === undefined ? null : cents(raw.familyPriceCents),
    weightGrams: Number.isSafeInteger(raw.weightGrams) && raw.weightGrams > 0 && raw.weightGrams <= MAX_WEIGHT_GRAMS ? raw.weightGrams : null,
    purchasable,
    maxOrderQuantity: purchasable ? maxOrderQuantity : 0,
    photos,
    // Phase 3 : rayon, variante (chaque format garde sa référence, son prix et son stock), Nouveauté, Sur demande,
    // disponibilité et visibilité. Un Manager antérieur à la phase 3 n'envoie pas ces champs : le produit reste alors
    // listé et compté comme nouveauté, comme avant.
    shelf,
    subcategory: shelf ? text(raw.subcategory, 60) : null,
    variantGroup,
    variantLabel: variantGroup ? text(raw.variantLabel, 60) : null,
    onRequest,
    isNew: raw.isNew === undefined ? true : raw.isNew === true,
    availability: AVAILABILITIES.has(raw.availability) ? raw.availability : null,
    listed: raw.listed === undefined ? true : raw.listed === true
  };
}

// Nouveautés (CAT-08, CAT-10) : produits visibles, publiés depuis moins de 14 jours, hors « Sur demande ».
function isNouveaute(product) {
  return product.listed && product.isNew && !product.onRequest;
}

function logFailure(scope, error) {
  console.error(`Catalogue Manager indisponible (${scope})`, error?.status || error?.name || "erreur");
}

async function listCatalogue(options = {}) {
  try {
    const config = configuration(options);
    const response = await managerGet(config, "/api/shop-catalog/products");
    if (!response.ok) throw Object.assign(new Error("orkhan_catalog_error"), { status: response.status });
    const body = await response.json();
    const products = (Array.isArray(body?.products) ? body.products : []).map(publicProduct).filter(Boolean);
    return { available: true, products };
  } catch (error) {
    logFailure("liste", error);
    return { available: false, products: [] };
  }
}

async function fetchCataloguePhoto(id, options = {}) {
  if (typeof id !== "string" || !UUID.test(id)) return { status: "not_found" };
  try {
    const config = configuration(options);
    const response = await managerGet(config, `/api/shop-catalog/photos/${id.toLowerCase()}`);
    if (response.status === 404) return { status: "not_found" };
    const contentType = response.headers?.get?.("content-type") || "";
    if (!response.ok || !/^image\/(webp|jpeg|png)$/.test(contentType)) throw Object.assign(new Error("orkhan_catalog_photo_error"), { status: response.status });
    return { status: "ok", contentType, bytes: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    logFailure("photo", error);
    return { status: "unavailable" };
  }
}

module.exports = { fetchCataloguePhoto, isNouveaute, listCatalogue, publicProduct };
