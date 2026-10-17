const { quoteCart } = require("./_cart");
const { cartCatalog } = require("./_cart-catalogue");
const { chipNumbers, resolveFamilyEligibility } = require("./_family-benefit");
const { createManagerClient } = require("./_orkhan-shop-orders");
const { createPaymentProvider } = require("./_payment");

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DELIVERY_FIELDS = ["address", "postalCode", "city", "country"];
const SHOP_LEGAL_CURRENT_VERSION = "cgv-2026-10-07";
// Lot 2, décision 3 : la session de paiement d'une commande avec des produits du catalogue expire après 30 minutes
// (minimum imposé par Stripe), plus une minute de tolérance d'horloge ; la réservation du Manager dure 40 minutes.
const CATALOGUE_CHECKOUT_EXPIRY_SECONDS = 31 * 60;
// Refus du Manager à la création de la commande, traduits pour le panier sans détail technique.
const MANAGER_ORDER_REFUSALS = {
  OUT_OF_STOCK: { error: "out_of_stock", status: 409 },
  PRODUCT_NOT_PURCHASABLE: { error: "product_not_purchasable", status: 409 },
  PRICE_MISMATCH: { error: "price_changed", status: 409 },
  UNKNOWN_PRODUCT: { error: "unknown_product", status: 400 }
};

function cleanString(value, maximum = 300) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validateCustomer(value, shippingMode) {
  const customer = {
    firstName: cleanString(value?.firstName, 100),
    lastName: cleanString(value?.lastName, 100),
    email: cleanString(value?.email, 200).toLowerCase(),
    phone: cleanString(value?.phone, 50),
    address: cleanString(value?.address),
    addressExtra: cleanString(value?.addressExtra),
    postalCode: cleanString(value?.postalCode, 20),
    city: cleanString(value?.city, 120),
    country: cleanString(value?.country, 2).toUpperCase()
  };
  if (!customer.firstName || !customer.lastName || !EMAIL.test(customer.email)
    || customer.phone.replace(/\D/g, "").length < 8) return { error: "invalid_customer" };
  if (shippingMode !== "pickup" && DELIVERY_FIELDS.some((field) => !customer[field])) {
    return { error: "invalid_customer" };
  }
  if (customer.country && !["FR", "BE"].includes(customer.country)) return { error: "invalid_customer" };
  return { customer };
}

function shippingCountryMatches(mode, country) {
  if (mode === "animoco-light-fr") return country === "FR";
  if (mode === "animoco-light-be") return country === "BE";
  if (mode === "red-dingo-free") return country === "FR" || country === "BE";
  return true;
}

function orderLines(lines) {
  return lines.map((line) => ({
    productId: line.productId,
    name: line.name,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.subtotalCents,
    ...(line.options ? { options: line.options } : {})
  }));
}

function shippingSnapshot(selection, quoteShipping) {
  return {
    mode: quoteShipping.mode,
    priceCents: quoteShipping.priceCents,
    ...(quoteShipping.country ? { country: quoteShipping.country } : {}),
    ...(quoteShipping.weightGrams ? { weightGrams: quoteShipping.weightGrams } : {}),
    ...(selection?.relayPoint ? { relayPoint: selection.relayPoint } : {}),
    ...(selection?.address ? { address: selection.address } : {})
  };
}

function requestOrigin(req) {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : null;
}

async function executeCheckout(input, options = {}) {
  const attemptId = cleanString(input?.checkoutAttemptId, 36);
  if (!UUID_V4.test(attemptId)) return { error: "invalid_checkout_attempt", status: 400 };
  if (!input?.shipping || typeof input.shipping.mode !== "string") {
    return { error: "shipping_required", status: 400 };
  }
  if (input?.legalAcceptance?.accepted !== true) return { error: "legal_acceptance_required", status: 400 };
  if (input.legalAcceptance.version !== SHOP_LEGAL_CURRENT_VERSION) return { error: "legal_version_outdated", status: 409 };
  const customerResult = validateCustomer(input.customer, input.shipping.mode);
  if (customerResult.error) return { ...customerResult, status: 400 };
  if (!shippingCountryMatches(input.shipping.mode, customerResult.customer.country)) {
    return { error: "shipping_country_mismatch", status: 400 };
  }

  const eligibility = await resolveFamilyEligibility(input.items, options);
  if (eligibility.error) return eligibility;
  const familyEligible = eligibility.familyEligible;

  const catalogue = await (options.cartCatalog || cartCatalog)(input.items, options);
  if (catalogue.error) return catalogue;
  const quoteResult = (options.quoteCart || quoteCart)({
    items: input.items,
    shipping: input.shipping,
    benefits: { dynastieFamily: familyEligible }
  }, { ...options.quoteOptions, ...(catalogue.catalog ? { catalog: catalogue.catalog } : {}) });
  if (quoteResult.error) {
    const status = quoteResult.error === "shipping_unavailable" ? 503
      : quoteResult.error === "out_of_stock" || quoteResult.error === "product_not_purchasable" ? 409 : 400;
    return { error: quoteResult.error, status };
  }
  const quote = quoteResult.quote;
  if (!quote.shipping || !Number.isInteger(quote.totalCents)) return { error: "shipping_required", status: 400 };
  if (quote.lines.some((line) => line.family === "red-dingo" || /^red-dingo:/i.test(line.productId)) && input.engravingConfirmed !== true) {
    return { error: "engraving_confirmation_required", status: 400 };
  }

  const lines = orderLines(quote.lines);
  const orderPayload = {
    currency: quote.currency,
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shipping.priceCents,
    totalCents: quote.totalCents,
    lines,
    shipping: shippingSnapshot(input.shipping, quote.shipping),
    customer: customerResult.customer,
    dynastieFamilyEligible: familyEligible,
    legalVersion: SHOP_LEGAL_CURRENT_VERSION,
    legalAcceptedAt: (options.now ? options.now() : new Date()).toISOString()
  };
  const manager = options.manager || createManagerClient(options.managerOptions);
  let created;
  try {
    created = await manager.createOrder(orderPayload, attemptId);
  } catch (error) {
    const refusal = MANAGER_ORDER_REFUSALS[error?.response?.error];
    if (refusal) return { ...refusal };
    throw error;
  }
  const orderReference = created.reference || created.order?.reference;
  if (!orderReference) throw new Error("invalid_manager_order_response");

  const origin = options.origin;
  if (!origin) throw new Error("boutique_origin_unavailable");
  const payment = options.payment || createPaymentProvider("STRIPE", options.paymentOptions);
  const session = await payment.createCheckout({
    idempotencyKey: attemptId,
    orderReference,
    currency: quote.currency,
    lines,
    shippingCents: quote.shipping.priceCents,
    customerEmail: customerResult.customer.email,
    ...(quote.lines.some((line) => line.family === "catalogue")
      ? { expiresAt: Math.floor((options.now ? options.now() : new Date()).getTime() / 1000) + CATALOGUE_CHECKOUT_EXPIRY_SECONDS } : {}),
    successUrl: `${origin}/panier/confirmation/?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/panier/?payment=cancelled`
  });
  await manager.attachPaymentReference(orderReference, {
    provider: payment.provider,
    providerRef: session.providerRef
  });
  return { ok: true, orderReference, checkoutUrl: session.checkoutUrl };
}

module.exports = {
  CATALOGUE_CHECKOUT_EXPIRY_SECONDS,
  UUID_V4,
  chipNumbers,
  executeCheckout,
  orderLines,
  requestOrigin,
  shippingSnapshot,
  shippingCountryMatches,
  validateCustomer,
  SHOP_LEGAL_CURRENT_VERSION
};
