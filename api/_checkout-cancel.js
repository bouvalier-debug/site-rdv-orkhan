const crypto = require("node:crypto");
const { createManagerClient } = require("./_orkhan-shop-orders");
const { createStripeAdapter } = require("./_payment/stripe");

// Lot 2, étape 6 : annulation du paiement par le client (retour sur l'URL d'annulation de Stripe).
// Le stock réservé n'est libéré qu'après une confirmation fiable de Stripe que la session ne peut plus aboutir :
// la session de la commande est expirée par l'API Stripe, et Stripe répond « expired » sans paiement. Dans tous les
// autres cas (échec, statut incertain, session terminée), rien n'est libéré : la réservation reste bloquée et apparaît
// « À vérifier » dans Orkhan Manager à son échéance.
// Le lien d'annulation porte un jeton signé : sans lui, personne ne peut annuler la commande d'un autre client.

const ORDER_REFERENCE = /^BOUT-\d{4}-[A-Z0-9]{10}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const RELEASABLE_STATUSES = new Set(["PENDING_PAYMENT", "ABANDONED"]);

function tokenKey(env) {
  const secret = env.ORKHAN_SHOP_ORDERS_SECRET;
  if (!secret) throw new Error("orkhan_manager_not_configured");
  return crypto.createHmac("sha256", secret).update("orkhan-checkout-cancel:v1").digest();
}

function checkoutCancelToken(reference, env = process.env) {
  return crypto.createHmac("sha256", tokenKey(env)).update(reference).digest("base64url");
}

function validCancelToken(reference, token, env = process.env) {
  if (typeof reference !== "string" || !ORDER_REFERENCE.test(reference) || typeof token !== "string" || !TOKEN.test(token)) return false;
  const expected = Buffer.from(checkoutCancelToken(reference, env));
  const received = Buffer.from(token);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function cancelUrl(origin, reference, env = process.env) {
  const params = new URLSearchParams({ payment: "cancelled", order: reference, cancel: checkoutCancelToken(reference, env) });
  return `${origin}/panier/?${params.toString()}`;
}

// Confirmation fiable : session de cette commande, expirée, sans paiement.
function confirmedExpired(session, reference, providerRef) {
  return session?.id === providerRef && session.client_reference_id === reference
    && session.metadata?.orderReference === reference && session.status === "expired" && session.payment_status === "unpaid";
}

// Issues renvoyées à la page panier, qui n’affiche « annulé » que sur confirmation :
// - cancelled : Stripe a confirmé l’expiration sans paiement, le Manager a libéré le stock (ou l’avait déjà fait) ;
// - payment_received : un paiement est connu (Manager ou Stripe) : la commande n’est pas annulée ;
// - uncertain : échec, erreur ou statut incertain : rien n’est libéré, le paiement doit être vérifié.
const PAID_STATUSES = new Set(["PAID", "REVIEW_REQUIRED", "REFUNDED"]);
const CONFIRMED_OPERATIONS = new Set(["recorded", "already_recorded"]);

function outcome(value, extra = {}) {
  return { status: 200, body: { ok: true, outcome: value, ...extra } };
}

async function processCheckoutCancel(input, options = {}) {
  const env = options.env || process.env;
  const reference = input?.order;
  if (!validCancelToken(reference, input?.cancel, env)) return { status: 400, body: { error: "invalid_cancel_link" } };
  const manager = options.manager || createManagerClient(options.managerOptions);
  const state = await manager.getCheckoutState(reference);
  if (PAID_STATUSES.has(state?.status)) return outcome("payment_received");
  // Seules les commandes du catalogue avec stock réservé sont concernées ; les parcours historiques ne changent pas.
  if (!state?.hasStockReservations || !RELEASABLE_STATUSES.has(state.status)) return outcome("uncertain");
  if (state.checkoutExpired) return outcome("cancelled", { operation: "already_recorded" });
  if (state.provider !== "STRIPE" || typeof state.providerRef !== "string" || !state.providerRef) return outcome("uncertain");
  const stripe = options.stripe || createStripeAdapter(options.stripeOptions);
  let session = null;
  try { session = await stripe.expireCheckout(state.providerRef); } catch {
    // Expiration refusée (session déjà terminée ou déjà expirée) : on relit la session avant toute décision.
    try { session = await stripe.retrieveCheckout(state.providerRef); } catch { session = null; }
  }
  if (session?.id === state.providerRef && session.payment_status === "paid") return outcome("payment_received");
  if (!confirmedExpired(session, reference, state.providerRef)) {
    console.warn("checkout_cancel_uncertain", JSON.stringify({ reference, status: session?.status ?? null, paymentStatus: session?.payment_status ?? null }));
    return outcome("uncertain");
  }
  const result = await manager.markCheckoutExpired(reference, {
    provider: "STRIPE",
    providerRef: state.providerRef,
    eventId: `cancel-${state.providerRef}`,
    expiredAt: (options.now ? options.now() : new Date()).toISOString()
  });
  if (CONFIRMED_OPERATIONS.has(result.operation)) return outcome("cancelled", { operation: result.operation });
  if (result.operation === "ignored_paid") return outcome("payment_received");
  return outcome("uncertain");
}

module.exports = { cancelUrl, checkoutCancelToken, confirmedExpired, processCheckoutCancel, validCancelToken };
