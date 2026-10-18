const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fetchCataloguePhoto, listCatalogue, publicProduct } = require("../api/_orkhan-catalog");
const productsHandler = require("../api/catalogue-produits");
const photoHandler = require("../api/catalogue-photo");
const { validateCart } = require("../api/_cart");
const { describeProducts, renderCatalogue, saleState, statusMessage, MESSAGES, NOT_FOR_SALE, OUT_OF_STOCK, PICKUP_ONLY } = require("../assets/nouveautes");

const SECRET = "secret-boutique-de-test-0123456789";
const BYPASS = "bypass-preview-de-test";
const PHOTO = "a00cf150-af68-4012-a46e-a700d7f7284c";
const MANAGER = { baseUrl: "https://manager-preview.example", secret: SECRET, vercelBypassSecret: BYPASS };

const MANAGER_BODY = {
  ok: true, purchaseLocked: true,
  products: [{
    reference: "test-photos-001", name: "Pack hiver", family: "COLIS", description: "Soins d'hiver\nPour chiens", displayOrder: 0, currency: "EUR",
    publicPriceCents: 3490, familyPriceCents: 2990, weightGrams: 900, purchasable: false, maxOrderQuantity: 0,
    id: "uuid-interne", status: "DRAFT", priceChanges: [{ changedBy: "Administrateur Orkhan" }], storageKey: "products/x/y.webp",
    photos: [
      { url: `/api/shop-catalog/photos/${PHOTO}`, width: 640, height: 480, altText: "Pack ouvert", main: true },
      { url: "https://winrymwjlzlotosrskys.supabase.co/storage/v1/object/catalog-photos/products/x/y.webp", width: 1, height: 1 }
    ]
  }, { reference: "", name: "Invalide", publicPriceCents: 100 }]
};

function managerFetch(body = MANAGER_BODY, init = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (init.throws) throw init.throws;
    return { ok: init.status ? init.status < 400 : true, status: init.status || 200, json: async () => body, headers: { get: (name) => (name === "content-type" ? init.contentType || "image/webp" : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  return { calls, fetchImpl };
}

function captureLogs() {
  const lines = []; const original = console.error;
  console.error = (...args) => { lines.push(args.map(String).join(" ")); };
  return { lines, restore: () => { console.error = original; } };
}

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.rawBody = body; return this; }
  };
}

async function withEnv(values, action) {
  const saved = {}; for (const key of Object.keys(values)) { saved[key] = process.env[key]; if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
  const originalFetch = global.fetch;
  try { return await action(); } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } global.fetch = originalFetch; }
}

test("lit le catalogue côté serveur avec le secret et le bypass Preview, en GET", async () => {
  const { calls, fetchImpl } = managerFetch();
  await listCatalogue({ ...MANAGER, fetch: fetchImpl });
  assert.equal(calls[0].url, "https://manager-preview.example/api/shop-catalog/products");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers["X-Orkhan-Shop-Orders-Secret"], SECRET);
  assert.equal(calls[0].options.headers["x-vercel-protection-bypass"], BYPASS);
});

test("ne garde que les champs publics et relaie les photos par la Boutique", async () => {
  const { fetchImpl } = managerFetch();
  const result = await listCatalogue({ ...MANAGER, fetch: fetchImpl });
  assert.equal(result.available, true);
  assert.deepEqual(result.products, [{
    reference: "test-photos-001", name: "Pack hiver", family: "COLIS", description: "Soins d'hiver\nPour chiens",
    publicPriceCents: 3490, familyPriceCents: 2990, weightGrams: 900, purchasable: false, maxOrderQuantity: 0,
    photos: [{ url: `/api/catalogue-photo?id=${PHOTO}`, width: 640, height: 480, altText: "Pack ouvert" }]
  }]);
  const serialized = JSON.stringify(result);
  for (const forbidden of [SECRET, BYPASS, "supabase", "storage", "priceChanges", "uuid-interne", "manager-preview", "DRAFT"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("lot 2 : un produit n'est achetable que sur indication explicite du Manager, quantité plafonnée", () => {
  const base = MANAGER_BODY.products[0];
  assert.deepEqual([publicProduct({ ...base, purchasable: true, maxOrderQuantity: 3 })].map((p) => [p.purchasable, p.maxOrderQuantity]), [[true, 3]]);
  assert.equal(publicProduct({ ...base, purchasable: true, maxOrderQuantity: 50 }).maxOrderQuantity, 20);
  assert.equal(publicProduct({ ...base, purchasable: "true", maxOrderQuantity: 3 }).purchasable, false);
  assert.equal(publicProduct({ ...base, purchasable: true, family: "RED_DINGO", maxOrderQuantity: 3 }).purchasable, false);
  // Croquettes vendables (retrait à l'élevage) dès que le Manager les indique achetables ; Red Dingo reste exclu.
  assert.deepEqual([publicProduct({ ...base, purchasable: true, family: "CROQUETTES", maxOrderQuantity: 3 })].map((p) => [p.purchasable, p.maxOrderQuantity]), [[true, 3]]);
  assert.equal(publicProduct({ ...base, purchasable: false, family: "CROQUETTES", maxOrderQuantity: 3 }).purchasable, false);
  assert.equal(publicProduct({ ...base, purchasable: true, publicPriceCents: 0, maxOrderQuantity: 3 }).purchasable, false);
  assert.equal(publicProduct({ ...base, purchasable: false, maxOrderQuantity: 3 }).maxOrderQuantity, 0);
});

test("bascule sur un état indisponible sûr si le Manager est absent, lent, en erreur ou non configuré, sans journaliser le secret", async () => {
  const logs = captureLogs();
  try {
    const cases = [
      managerFetch(MANAGER_BODY, { status: 401 }).fetchImpl,
      managerFetch(MANAGER_BODY, { status: 503 }).fetchImpl,
      managerFetch(MANAGER_BODY, { throws: Object.assign(new Error(`timeout ${SECRET}`), { name: "AbortError" }) }).fetchImpl
    ];
    for (const fetchImpl of cases) assert.deepEqual(await listCatalogue({ ...MANAGER, fetch: fetchImpl }), { available: false, products: [] });
    await withEnv({ ORKHAN_MANAGER_URL: undefined, ORKHAN_SHOP_ORDERS_SECRET: undefined }, async () => {
      assert.equal((await listCatalogue()).available, false);
    });
  } finally { logs.restore(); }
  assert.ok(logs.lines.length >= 4);
  assert.equal(logs.lines.some((line) => line.includes(SECRET) || line.includes(BYPASS)), false);
});

test("l'API de la Boutique renvoie les nouveautés sans secret et refuse les autres méthodes", async () => {
  await withEnv({ ORKHAN_MANAGER_URL: MANAGER.baseUrl, ORKHAN_SHOP_ORDERS_SECRET: SECRET, ORKHAN_MANAGER_VERCEL_BYPASS_SECRET: BYPASS }, async () => {
    global.fetch = managerFetch().fetchImpl;
    const ok = responseRecorder(); await productsHandler({ method: "GET" }, ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.products[0].purchasable, false);
    assert.match(ok.headers["cache-control"], /s-maxage=60/);
    assert.equal(JSON.stringify(ok).includes(SECRET), false);
    const post = responseRecorder(); await productsHandler({ method: "POST" }, post);
    assert.equal(post.statusCode, 405);
    global.fetch = managerFetch(MANAGER_BODY, { status: 503 }).fetchImpl;
    const logs = captureLogs();
    const down = responseRecorder(); try { await productsHandler({ method: "GET" }, down); } finally { logs.restore(); }
    assert.equal(down.statusCode, 200); assert.equal(down.body.available, false); assert.equal(down.headers["cache-control"], "no-store");
  });
});

test("relaie une photo publiée sans exposer le Manager, et refuse les identifiants invalides", async () => {
  const { calls, fetchImpl } = managerFetch();
  assert.deepEqual(await fetchCataloguePhoto("../../catalog-photos", { ...MANAGER, fetch: fetchImpl }), { status: "not_found" });
  assert.equal(calls.length, 0);
  const ok = await fetchCataloguePhoto(PHOTO.toUpperCase(), { ...MANAGER, fetch: fetchImpl });
  assert.equal(ok.status, "ok"); assert.equal(ok.contentType, "image/webp");
  assert.equal(calls[0].url, `https://manager-preview.example/api/shop-catalog/photos/${PHOTO}`);
  assert.deepEqual(await fetchCataloguePhoto(PHOTO, { ...MANAGER, fetch: managerFetch(MANAGER_BODY, { status: 404 }).fetchImpl }), { status: "not_found" });
  const logs = captureLogs();
  try { assert.deepEqual(await fetchCataloguePhoto(PHOTO, { ...MANAGER, fetch: managerFetch(MANAGER_BODY, { contentType: "text/html" }).fetchImpl }), { status: "unavailable" }); }
  finally { logs.restore(); }

  await withEnv({ ORKHAN_MANAGER_URL: MANAGER.baseUrl, ORKHAN_SHOP_ORDERS_SECRET: SECRET }, async () => {
    global.fetch = managerFetch().fetchImpl;
    const response = responseRecorder(); await photoHandler({ method: "GET", query: { id: PHOTO } }, response);
    assert.equal(response.statusCode, 200); assert.equal(response.headers["content-type"], "image/webp");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.deepEqual([...response.rawBody], [1, 2, 3]);
    assert.equal(JSON.stringify(response.headers).includes(SECRET), false);
    const invalid = responseRecorder(); await photoHandler({ method: "GET", query: { id: "x" } }, invalid);
    assert.equal(invalid.statusCode, 404);
  });
});

function fakeDocument() {
  const make = (tag) => ({ tag, children: [], dataset: {}, className: "", textContent: "", append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; } });
  return { createElement: make };
}
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }

test("la page affiche nom, description, prix et photos, sans moyen d'acheter un produit non achetable", () => {
  const data = { available: true, products: [{ name: "<img src=x onerror=alert(1)>", description: "Texte", publicPriceCents: 3490, familyPriceCents: 2990, photos: [{ url: `/api/catalogue-photo?id=${PHOTO}`, altText: "Pack", width: 640, height: 480 }, { url: "https://evil.example/x.png" }] }] };
  const document = fakeDocument(); const container = document.createElement("section"); const status = document.createElement("p");
  assert.equal(renderCatalogue(document, container, status, data), 1);
  const nodes = flatten(container);
  assert.deepEqual(nodes.filter((node) => node.tag === "img").map((node) => node.src), [`/api/catalogue-photo?id=${PHOTO}`]);
  assert.equal(nodes.some((node) => ["button", "form", "a", "input"].includes(node.tag)), false);
  const texts = nodes.map((node) => node.textContent).filter(Boolean);
  assert.ok(texts.includes(NOT_FOR_SALE));
  assert.ok(texts.includes("<img src=x onerror=alert(1)>"));
  assert.ok(texts.some((value) => /Prix : 34,90/.test(value)));
  assert.ok(texts.some((value) => /Prix famille Dynastie : 29,90/.test(value)));
  assert.equal(status.hidden, true);
});

test("la page affiche un message adapté si le catalogue est indisponible ou vide", () => {
  assert.equal(statusMessage({ available: false, products: [] }), MESSAGES.unavailable);
  assert.equal(statusMessage(null), MESSAGES.unavailable);
  assert.equal(statusMessage({ available: true, products: [] }), MESSAGES.empty);
  assert.deepEqual(describeProducts({ available: false, products: [{ name: "x", publicPriceCents: 1 }] }), []);
  const document = fakeDocument(); const container = document.createElement("section"); const status = document.createElement("p");
  renderCatalogue(document, container, status, { available: false });
  assert.equal(status.textContent, MESSAGES.unavailable); assert.equal(status.hidden, false); assert.equal(container.children.length, 0);
});

test("lot 2 : seul un produit achetable avec du stock affiche le bouton d'ajout au panier", () => {
  const document = fakeDocument(); const container = document.createElement("section"); const status = document.createElement("p");
  const product = (extra) => ({ reference: "shampoing-test", name: "Shampoing", publicPriceCents: 1500, photos: [], ...extra });
  renderCatalogue(document, container, status, { available: true, products: [
    product({ purchasable: true, maxOrderQuantity: 2 }), product({ reference: "brosse-test", purchasable: true, maxOrderQuantity: 0 }), product({ reference: "gamelle-test", purchasable: false, maxOrderQuantity: 5 })
  ] });
  const nodes = flatten(container);
  const buttons = nodes.filter((node) => node.tag === "button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].dataset.catalogueReference, "shampoing-test");
  const texts = nodes.map((node) => node.textContent);
  for (const label of [PICKUP_ONLY, OUT_OF_STOCK, NOT_FOR_SALE]) assert.ok(texts.includes(label), label);
  assert.deepEqual(saleState({ reference: "x", purchasable: true }), { reference: "x", buyable: false, availability: OUT_OF_STOCK });
});

test("la page /nouveautes/ n'a pas de paiement direct et n'est pas indexée", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "nouveautes", "index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /retrait sur place à l’élevage/);
  assert.match(html, /<script src="\/assets\/product-cart\.js"><\/script>/);
  assert.equal(/checkout|stripe/i.test(html), false);
  assert.equal(/ORKHAN_|SECRET|supabase/i.test(html + fs.readFileSync(path.join(__dirname, "..", "assets", "nouveautes.js"), "utf8")), false);
});

test("sans catalogue Manager, un produit du nouveau catalogue ne peut pas entrer dans le panier serveur", () => {
  assert.deepEqual(validateCart({ items: [{ productId: "test-photos-001", quantity: 1 }] }), { error: "unknown_product" });
  assert.deepEqual(validateCart({ items: [{ productId: "animoco", quantity: 1 }, { productId: "test-photos-001", quantity: 1 }] }), { error: "unknown_product" });
  assert.equal(validateCart({ items: [{ productId: "animoco", quantity: 1 }] }).lines[0].unitPriceCents, 1999);
});
