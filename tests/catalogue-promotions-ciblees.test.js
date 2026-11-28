"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFiches, ficheCard } = require("../api/_vitrine");
const { publicProduct } = require("../api/_orkhan-catalog");

const base = { reference: "croq-1", name: "Croquettes test", publicPriceCents: 1600, purchasable: true, family: "CROQUETTES", maxOrderQuantity: 5, availability: "IN_STOCK", shelf: "alimentation", subcategory: "croquettes", photos: [] };

test("remise ciblée : badge −X %, prix de référence barré, mention de fin", () => {
  const product = publicProduct({ ...base, promotion: { percent: 20, endsAt: "2026-12-31T23:00:00.000Z", reduction: { referencePriceCents: 2000, percent: 20 } } });
  const [fiche] = buildFiches([product], []);
  const html = ficheCard(fiche);
  assert.match(html, /<span class="tile-promo">−20 %<\/span>/);
  assert.match(html, /<s class="price-ref">[^<]*<span class="sr-only">[^<]*<\/span>20,00/);
  assert.match(html, /16,00/);
  assert.match(html, /Offre jusqu’au 31 décembre 2026/);
});

test("sans prix de référence ou sans remise : aucun badge ni prix barré", () => {
  for (const promotion of [undefined, { percent: 20, endsAt: null, reduction: null }]) {
    const [fiche] = buildFiches([publicProduct({ ...base, ...(promotion ? { promotion } : {}) })], []);
    const html = ficheCard(fiche);
    assert.doesNotMatch(html, /tile-promo|price-ref/);
  }
});

test("page Promotions : cartes des articles remisés ou en offre, message sinon", () => {
  const { renderPromotions } = require("../api/_vitrine");
  const promo = publicProduct({ ...base, promotion: { percent: 20, endsAt: null, reduction: { referencePriceCents: 2000, percent: 20 } } });
  const plain = publicProduct({ ...base, reference: "croq-2", name: "Sans remise" });
  const withPromo = renderPromotions({ available: true, products: [promo, plain], commercial: { offers: [] } });
  assert.match(withPromo, /Croquettes test/);
  assert.doesNotMatch(withPromo, /Sans remise/);
  assert.match(withPromo, /−20 %/);
  assert.match(renderPromotions({ available: true, products: [plain], commercial: { offers: [] } }), /Aucune promotion en cours actuellement/);
  assert.equal(renderPromotions({ available: false, products: [] }), null);
});
