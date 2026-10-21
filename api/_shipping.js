const SHIPPING_MODES = Object.freeze({
  PICKUP: "pickup",
  ANIMOCO_LIGHT_FR: "animoco-light-fr",
  ANIMOCO_LIGHT_BE: "animoco-light-be",
  MONDIAL_RELAY_PICKUP: "mondial-relay-pickup",
  MONDIAL_RELAY_HOME: "mondial-relay-home",
  RED_DINGO_FREE: "red-dingo-free"
});

// TODO(data-David): fill weights, served countries and both rate tables before
// a parcel shipment can be quoted in Preview/Production. Empty tables are a
// deliberate fail-closed configuration, not zero-price shipping.
const SHIPPING_CONFIG = Object.freeze({
  animocoLight: Object.freeze({
    maximumQuantity: 2,
    pricesCents: Object.freeze({ FR: 350, BE: 490 })
  }),
  mondialRelay: Object.freeze({
    servedCountries: Object.freeze([]),
    pickupRates: Object.freeze([]),
    homeRates: Object.freeze([])
  }),
  redDingo: Object.freeze({
    priceCents: 0,
    // Phase 4 : livraison directe par le fabricant, frais compris, dans les 27 pays de l'Union européenne (CGV 7.3).
    // Liste unique, reprise par le formulaire du panier et par la validation serveur de la commande.
    servedCountries: Object.freeze([
      "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
      "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"
    ])
  })
});

// Phase 4 : moment du retrait choisi au panier (CGV 7.5), sans date.
const PICKUP_TIMINGS = Object.freeze(["puppy-departure", "appointment"]);

function parcelRate(weightGrams, rates) {
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return null;
  const rate = rates.find((entry) => weightGrams <= entry.maxWeightGrams);
  return rate ? rate.priceCents : null;
}

function shippingProfile(lines) {
  let animocoQuantity = 0;
  let hasParcelProduct = false;
  let hasRedDingo = false;
  let parcelWeightGrams = 0;
  let missingWeight = false;
  let hasCatalogue = false;

  for (const line of lines) {
    if (line.family === "catalogue") {
      hasCatalogue = true;
      continue;
    }
    if (line.family === "red-dingo") {
      hasRedDingo = true;
      continue;
    }
    if (line.family === "animoco") animocoQuantity += line.quantity;
    if (line.family === "colis") hasParcelProduct = true;
    if (line.family === "animoco" || line.family === "colis") {
      if (!Number.isFinite(line.weightGrams)) missingWeight = true;
      else parcelWeightGrams += line.weightGrams * line.quantity;
    }
  }

  // Lot 2 : un panier contenant un produit du catalogue Manager est proposé en retrait sur place uniquement,
  // sans frais inventés, jusqu'à l'activation de Mondial Relay avec les tarifs réels.
  // Phase 4 : les médailles Red Dingo se commandent séparément de tout autre produit (CGV 5.6).
  const kind = hasRedDingo && (hasCatalogue || hasParcelProduct || animocoQuantity > 0)
    ? "red-dingo-mixed"
    : hasCatalogue
    ? "pickup-only"
    : hasParcelProduct || animocoQuantity >= 3
      ? "parcel"
      : animocoQuantity > 0 ? "animoco-light" : hasRedDingo ? "red-dingo-only" : "empty";
  return { kind, animocoQuantity, hasParcelProduct, hasRedDingo, hasCatalogue, parcelWeightGrams, missingWeight };
}

function mondialRelayConfigured(profile, config = SHIPPING_CONFIG) {
  return !profile.missingWeight
    && config.mondialRelay.pickupRates.length > 0
    && config.mondialRelay.homeRates.length > 0;
}

function availableShippingModes(profile, config = SHIPPING_CONFIG) {
  if (profile.kind === "pickup-only") return [SHIPPING_MODES.PICKUP];
  if (profile.kind === "parcel") {
    return mondialRelayConfigured(profile, config)
      ? [SHIPPING_MODES.PICKUP, SHIPPING_MODES.MONDIAL_RELAY_PICKUP, SHIPPING_MODES.MONDIAL_RELAY_HOME]
      : [SHIPPING_MODES.PICKUP];
  }
  // Phase 4 : Animoco en France seulement (la Belgique reste lisible pour les commandes historiques) ; Red Dingo
  // toujours livré par le fabricant, sans retrait.
  if (profile.kind === "animoco-light") {
    return [SHIPPING_MODES.PICKUP, SHIPPING_MODES.ANIMOCO_LIGHT_FR];
  }
  if (profile.kind === "red-dingo-only") {
    return [SHIPPING_MODES.RED_DINGO_FREE];
  }
  return [];
}

function validRelayPoint(point) {
  return Boolean(point && typeof point.id === "string" && /^[A-Z0-9-]{3,20}$/i.test(point.id.trim())
    && typeof point.address === "string" && point.address.trim().length >= 5
    && typeof point.country === "string" && /^[A-Z]{2}$/i.test(point.country.trim()));
}

function validHomeAddress(address) {
  return Boolean(address && ["line1", "postalCode", "city", "country"].every((key) =>
    typeof address[key] === "string" && address[key].trim()));
}

function calculateShipping(profile, selection = {}, config = SHIPPING_CONFIG) {
  const modes = availableShippingModes(profile, config);
  const mode = selection.mode;
  if (profile.kind === "red-dingo-mixed") return { error: "red_dingo_separate_order", availableModes: modes };
  if (profile.kind === "parcel"
    && [SHIPPING_MODES.MONDIAL_RELAY_PICKUP, SHIPPING_MODES.MONDIAL_RELAY_HOME].includes(mode)
    && !mondialRelayConfigured(profile, config)) {
    return { error: "shipping_unavailable", availableModes: modes };
  }
  if (!modes.includes(mode)) return { error: "invalid_shipping_mode", availableModes: modes };
  if (mode === SHIPPING_MODES.PICKUP) {
    // Le moment du retrait est facultatif au devis et exigé au paiement (voir _checkout.js).
    if (selection.pickupTiming !== undefined && !PICKUP_TIMINGS.includes(selection.pickupTiming)) {
      return { error: "invalid_pickup_timing", availableModes: modes };
    }
    return { mode, priceCents: 0, ...(selection.pickupTiming ? { pickupTiming: selection.pickupTiming } : {}), availableModes: modes };
  }
  if (mode === SHIPPING_MODES.ANIMOCO_LIGHT_FR || mode === SHIPPING_MODES.ANIMOCO_LIGHT_BE) {
    const country = mode.endsWith("-fr") ? "FR" : "BE";
    return { mode, country, priceCents: config.animocoLight.pricesCents[country], availableModes: modes };
  }
  if (mode === SHIPPING_MODES.RED_DINGO_FREE) {
    return { mode, priceCents: config.redDingo.priceCents, availableModes: modes };
  }
  if (profile.missingWeight) return { error: "shipping_weight_missing", availableModes: modes };
  if (mode === SHIPPING_MODES.MONDIAL_RELAY_PICKUP && !validRelayPoint(selection.relayPoint)) {
    return { error: "invalid_relay_point", availableModes: modes };
  }
  if (mode === SHIPPING_MODES.MONDIAL_RELAY_HOME && !validHomeAddress(selection.address)) {
    return { error: "invalid_home_address", availableModes: modes };
  }
  const country = mode === SHIPPING_MODES.MONDIAL_RELAY_PICKUP
    ? selection.relayPoint.country.trim().toUpperCase()
    : selection.address.country.trim().toUpperCase();
  if (!config.mondialRelay.servedCountries.includes(country)) {
    return { error: "unsupported_shipping_country", availableModes: modes };
  }
  const rates = mode === SHIPPING_MODES.MONDIAL_RELAY_PICKUP
    ? config.mondialRelay.pickupRates : config.mondialRelay.homeRates;
  const priceCents = parcelRate(profile.parcelWeightGrams, rates);
  if (priceCents === null) return { error: "shipping_rate_unavailable", availableModes: modes };
  return { mode, country, priceCents, weightGrams: profile.parcelWeightGrams, availableModes: modes };
}

module.exports = {
  PICKUP_TIMINGS,
  SHIPPING_CONFIG,
  SHIPPING_MODES,
  availableShippingModes,
  calculateShipping,
  mondialRelayConfigured,
  parcelRate,
  shippingProfile,
  validHomeAddress,
  validRelayPoint
};
