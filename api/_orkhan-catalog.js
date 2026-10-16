const { endpoint } = require("./_orkhan-shop-orders");

// Lecture du nouveau catalogue administré dans Orkhan Manager (lot 1), uniquement côté serveur.
// Le secret Boutique ne quitte jamais ce module : il n'est ni renvoyé au navigateur, ni journalisé.
// Ces produits ne sont jamais achetables ici : ils ne passent ni par _catalog.js, ni par le panier, ni par Stripe.

const REQUEST_TIMEOUT_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGER_PHOTO_PATH = /^\/api\/shop-catalog\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const FAMILIES = new Set(["ANIMOCO", "RED_DINGO", "COLIS", "CROQUETTES"]);
const MAX_PRICE_CENTS = 10_000_000;

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
    purchasable: false,
    photos
  };
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
    return { available: true, purchasable: false, products };
  } catch (error) {
    logFailure("liste", error);
    return { available: false, purchasable: false, products: [] };
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

module.exports = { fetchCataloguePhoto, listCatalogue, publicProduct };
