// Panier : miniature de la référence choisie et lien vers sa fiche (affichage seulement, sans effet sur la commande).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { quoteCartRequest } = require("../api/cart-quote");
const { executeCheckout } = require("../api/_checkout");
const { publicProduct } = require("../api/_orkhan-catalog");
const cart = require("../assets/cart");
const { fakePricingManager } = require("./helpers/manager-pricing");

const PHOTO = "00000000-0000-4000-9000-0000000000a1";
const raw = (reference, extra = {}) => ({
  reference, name: "Soopa – Bâtonnets dentaires pomme et myrtille – 100 g", family: "COLIS", publicPriceCents: 550, weightGrams: 100,
  purchasable: true, maxOrderQuantity: 5, photos: [{ url: `/api/shop-catalog/photos/${PHOTO}`, width: 1600, height: 1600, altText: "Sachet Soopa" }],
  shelf: "ALIMENTATION", subcategory: "friandises", brand: "SOOPA", isNew: false, availability: "in_stock", listed: true, ...extra
});
const PRODUCTS = [raw("soopa-pomme-100-g"), raw("croquettes-2kg", { name: "Croquettes", variantGroup: "croquettes", variantLabel: "2 kg", photos: [] })].map(publicProduct);
const options = { listCatalogue: async () => ({ available: true, products: PRODUCTS }), manager: fakePricingManager() };
const PICKUP = { mode: "pickup", pickupTiming: "appointment" };

test("le devis fournit la photo réelle de la référence et le lien vers sa fiche ; secours sans photo", async () => {
  const result = await quoteCartRequest({ items: [{ productId: "soopa-pomme-100-g", quantity: 1 }, { productId: "croquettes-2kg", quantity: 1 }], shipping: PICKUP }, options);
  const [soopa, croquettes] = result.quote.lines;
  assert.deepEqual(soopa.photo, { url: `/api/catalogue-photo?id=${PHOTO}`, altText: "Sachet Soopa" });
  assert.equal(soopa.href, "/produits/soopa-pomme-100-g/");
  assert.equal(croquettes.photo, undefined, "variante sans photo : cadre de secours");
  assert.equal(croquettes.href, "/produits/croquettes-2kg/", "le lien d'une variante ouvre la fiche sur cette variante");
  // Prix, remises et totaux inchangés.
  assert.deepEqual(result.quote.lines.map((line) => line.unitPriceCents), [550, PRODUCTS[1].publicPriceCents]);
});

test("médailles : photo Animoco et modèle Red Dingo de la couleur choisie, liens vers leurs pages", async () => {
  const animoco = await quoteCartRequest({ items: [{ productId: "animoco", quantity: 1 }] }, options);
  assert.deepEqual([animoco.quote.lines[0].photo.url, animoco.quote.lines[0].href], ["/medailles-connectees/assets/medaille-animoco-recto-verso.webp", "/medailles-connectees/"]);
  const redDingo = await quoteCartRequest({ items: [{ productId: "red-dingo:01-EL", quantity: 1, options: { size: "S", colour: "Light Blue", frontLines: ["ORKHAN"] } }] }, options);
  assert.deepEqual([redDingo.quote.lines[0].photo.url, redDingo.quote.lines[0].href], ["/medailles-gravees/models/01-EL-LB.jpg", "/medailles-gravees/"]);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "medailles-gravees", "models", "01-EL-LB.jpg")));
  assert.ok(fs.existsSync(path.join(__dirname, "..", "medailles-connectees", "assets", "medaille-animoco-recto-verso.webp")));
});

test("navigateur : seuls les chemins internes sont affichés ; la commande ne reçoit ni photo ni lien", async () => {
  assert.deepEqual(cart.lineDisplayOf({ photo: { url: "/api/catalogue-photo?id=x", altText: "a" }, href: "/produits/x/" }), { photo: { url: "/api/catalogue-photo?id=x", altText: "a" }, href: "/produits/x/" });
  assert.deepEqual(cart.lineDisplayOf({ photo: { url: "https://evil.test/x.jpg" }, href: "//evil.test/" }), { photo: null, href: null });
  assert.deepEqual(cart.lineDisplayOf({ photo: { url: "javascript:alert(1)" }, href: "javascript:alert(1)" }), { photo: null, href: null });
  assert.equal(cart.lineDisplayOf(undefined), null);
  const created = [];
  const stripe = [];
  await executeCheckout({
    checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000", items: [{ productId: "soopa-pomme-100-g", quantity: 1 }], shipping: PICKUP,
    customer: { firstName: "T", lastName: "M", email: "t@example.test", phone: "0600000000", country: "FR" }, legalAcceptance: { version: "cgv-2026-11-26", accepted: true }
  }, {
    ...options, origin: "https://boutique.test", env: { ORKHAN_SHOP_ORDERS_SECRET: "s" },
    manager: { ...fakePricingManager(), async createOrder(payload) { created.push(payload); return { reference: "BOUT-TEST" }; }, async attachPaymentReference() { return {}; } },
    payment: { provider: "STRIPE", async createCheckout(input) { stripe.push(input); return { providerRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.test" }; } }
  });
  assert.doesNotMatch(JSON.stringify(created) + JSON.stringify(stripe), /catalogue-photo|"href"|"photo"/);
});

test("panier : miniature 80 × 80 px (60 × 60 px sur mobile), image entière, photo et nom cliquables", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "panier", "index.html"), "utf8");
  assert.match(html, /\.cart-line__thumb\{[^}]*width:80px;height:80px/);
  assert.match(html, /@media\(max-width:600px\)\{[^}]*\}\.cart-line__thumb\{width:60px;height:60px\}/);
  assert.match(html, /\.cart-line__thumb img\{[^}]*object-fit:contain/);
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "cart.js"), "utf8");
  assert.match(source, /const link = element\(document, "a", "cart-line__link", lineName\);/);
  assert.match(source, /frame\.href = display\.href;/);
  assert.match(source, /cart-line__thumb--empty/);
});
