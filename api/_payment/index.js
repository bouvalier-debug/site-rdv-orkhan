const { createStripeAdapter } = require("./stripe");

function createPaymentProvider(name = "STRIPE", options = {}) {
  if (name !== "STRIPE") throw new Error("unsupported_payment_provider");
  return createStripeAdapter(options.stripe);
}

module.exports = { createPaymentProvider };
