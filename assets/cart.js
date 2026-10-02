(function cartModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OrkhanCart = api;
  if (root && root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => api.autoInit(root));
    } else {
      api.autoInit(root);
    }
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCartModule() {
  "use strict";

  const STORAGE_KEY = "orkhan-shop-cart-v1";
  const CUSTOMER_STORAGE_KEY = "orkhan-shop-customer-v1";
  const STORAGE_VERSION = 1;
  const MAX_QUANTITY = 20;
  const PRICE_KEYS = /^(price|priceCents|unitPrice|unitPriceCents|subtotal|subtotalCents|shipping|shippingCents|total|totalCents)$/i;
  const MODE_LABELS = Object.freeze({
    pickup: "Retrait à l’élevage",
    "animoco-light-fr": "Envoi léger Animoco — France",
    "animoco-light-be": "Envoi léger Animoco — Belgique",
    "mondial-relay-pickup": "Mondial Relay — Point Relais ou Locker",
    "mondial-relay-home": "Mondial Relay — Livraison à domicile",
    "red-dingo-free": "Envoi Red Dingo offert"
  });
  const CUSTOMER_FIELDS = Object.freeze([
    "firstName", "lastName", "email", "phone", "address", "addressExtra", "postalCode", "city", "country"
  ]);

  function validQuantity(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;
  }

  function safeOptionValue(value, depth = 0) {
    if (depth > 5) return undefined;
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
      return value.map((entry) => safeOptionValue(entry, depth + 1)).filter((entry) => entry !== undefined);
    }
    if (value && typeof value === "object") {
      const clean = {};
      for (const [key, entry] of Object.entries(value)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype" || PRICE_KEYS.test(key)) continue;
        const sanitized = safeOptionValue(entry, depth + 1);
        if (sanitized !== undefined) clean[key] = sanitized;
      }
      return clean;
    }
    return undefined;
  }

  function sanitizeLine(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const productId = typeof value.productId === "string" ? value.productId.trim() : "";
    const lineId = typeof value.lineId === "string" ? value.lineId.trim() : "";
    if (!productId || !lineId || !validQuantity(value.quantity)) return null;
    const options = safeOptionValue(value.options || {});
    return { lineId, productId, quantity: value.quantity, ...(Object.keys(options).length ? { options } : {}) };
  }

  function parseStoredCart(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
      return parsed.items.map(sanitizeLine).filter(Boolean);
    } catch {
      return [];
    }
  }

  function createLineId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function createCartStore(options = {}) {
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const idFactory = options.idFactory || createLineId;
    const listeners = new Set();
    let items = storage ? parseStoredCart(storage.getItem(STORAGE_KEY)) : [];

    function snapshot() {
      return items.map((item) => ({ ...item, ...(item.options ? { options: safeOptionValue(item.options) } : {}) }));
    }

    function persist() {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, items }));
      const state = snapshot();
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function add(input) {
      const candidate = sanitizeLine({
        lineId: typeof input?.lineId === "string" ? input.lineId : idFactory(),
        productId: input?.productId,
        quantity: input?.quantity === undefined ? 1 : input.quantity,
        options: input?.options
      });
      if (!candidate) throw new TypeError("invalid_cart_line");
      items.push(candidate);
      return persist();
    }

    function updateQuantity(lineId, quantity) {
      if (!validQuantity(quantity)) throw new RangeError("invalid_quantity");
      const index = items.findIndex((item) => item.lineId === lineId);
      if (index < 0) return snapshot();
      items[index] = { ...items[index], quantity };
      return persist();
    }

    function remove(lineId) {
      items = items.filter((item) => item.lineId !== lineId);
      return persist();
    }

    function clear() {
      items = [];
      return persist();
    }

    return {
      add,
      clear,
      count: () => items.reduce((sum, item) => sum + item.quantity, 0),
      getItems: snapshot,
      remove,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      updateQuantity
    };
  }

  function sanitizeCustomer(value) {
    const customer = {};
    for (const field of CUSTOMER_FIELDS) {
      customer[field] = typeof value?.[field] === "string" ? value[field].slice(0, 300) : "";
    }
    return customer;
  }

  function parseStoredCustomer(raw) {
    if (!raw) return sanitizeCustomer({});
    try {
      const parsed = JSON.parse(raw);
      return parsed?.version === STORAGE_VERSION ? sanitizeCustomer(parsed.customer) : sanitizeCustomer({});
    } catch {
      return sanitizeCustomer({});
    }
  }

  function createCustomerStore(options = {}) {
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    let customer = storage ? parseStoredCustomer(storage.getItem(CUSTOMER_STORAGE_KEY)) : sanitizeCustomer({});
    function persist() {
      if (storage) storage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, customer }));
      return { ...customer };
    }
    return {
      get: () => ({ ...customer }),
      setField(field, value) {
        if (!CUSTOMER_FIELDS.includes(field)) return { ...customer };
        customer = { ...customer, [field]: typeof value === "string" ? value.slice(0, 300) : "" };
        return persist();
      },
      replace(value) { customer = sanitizeCustomer(value); return persist(); }
    };
  }

  function requiredCustomerFields(shippingMode) {
    const identity = ["firstName", "lastName", "email", "phone"];
    return shippingMode === "pickup"
      ? identity
      : [...identity, "address", "postalCode", "city", "country"];
  }

  function quoteItem(item) {
    const clean = sanitizeLine(item);
    if (!clean) return null;
    return {
      productId: clean.productId,
      quantity: clean.quantity,
      ...(clean.options ? { options: clean.options } : {})
    };
  }

  function buildQuotePayload(items, shipping, benefits) {
    const payload = { items: items.map(quoteItem).filter(Boolean) };
    if (shipping && typeof shipping.mode === "string") payload.shipping = safeOptionValue(shipping);
    if (benefits && benefits.dynastieFamily === true) payload.benefits = { dynastieFamily: true };
    return payload;
  }

  function money(cents) {
    return Number.isInteger(cents)
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
      : "—";
  }

  function quoteStatusMessage(result) {
    const code = result?.error || result?.quote?.shippingStatus;
    if (code === "shipping_unavailable") {
      return "Les tarifs colis ne sont pas encore disponibles. Aucun tarif de livraison n’a été appliqué. Vous pouvez choisir le retrait à l’élevage ou revenir plus tard.";
    }
    if (code === "shipping_weight_missing") return "Le poids nécessaire au calcul de livraison est indisponible.";
    if (code === "invalid_relay_point") return "Choisissez un Point Relais ou Locker valide.";
    if (code === "invalid_home_address") return "Complétez l’adresse de livraison à domicile.";
    if (code === "unsupported_shipping_country") return "Ce pays n’est pas desservi pour ce mode de livraison.";
    if (result?.error) return "Le devis n’a pas pu être calculé. Vérifiez votre panier puis réessayez.";
    return "";
  }

  async function requestQuote(items, shipping, options = {}) {
    const fetchImpl = options.fetch || fetch;
    const response = await fetchImpl(options.url || "/api/cart-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQuotePayload(items, shipping, options.benefits))
    });
    let result;
    try { result = await response.json(); } catch { result = { error: "invalid_server_response" }; }
    if (!response.ok && !result.error) result.error = "quote_unavailable";
    return result;
  }

  function optionRows(options, prefix = "") {
    const rows = [];
    for (const [key, value] of Object.entries(options || {})) {
      if (value === "" || value === null || value === undefined || (Array.isArray(value) && !value.length)) continue;
      const label = `${prefix}${key}`;
      if (Array.isArray(value)) rows.push([label, value.join(" · ")]);
      else if (typeof value === "object") rows.push(...optionRows(value, `${label} `));
      else rows.push([label, String(value)]);
    }
    return rows;
  }

  function humanizeOption(key) {
    const labels = {
      size: "Taille", colour: "Couleur", color: "Couleur", frontLines: "Gravure recto",
      backLines: "Gravure verso", recto: "Gravure recto", verso: "Gravure verso", reference: "Référence"
    };
    return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
  }

  function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function updateCounters(document, count) {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = String(count);
      node.hidden = count === 0;
      node.setAttribute("aria-label", `${count} article${count > 1 ? "s" : ""} dans le panier`);
    });
  }

  function mountCartPage(root, options = {}) {
    const document = root.document;
    const container = document.querySelector("[data-cart-page]");
    if (!container) return null;
    const store = options.store || createCartStore();
    const customerStore = options.customerStore || createCustomerStore();
    const linesNode = container.querySelector("[data-cart-lines]");
    const emptyNode = container.querySelector("[data-cart-empty]");
    const modesNode = container.querySelector("[data-shipping-modes]");
    const statusNode = container.querySelector("[data-cart-status]");
    const subtotalNode = container.querySelector("[data-cart-subtotal]");
    const shippingNode = container.querySelector("[data-cart-shipping]");
    const totalNode = container.querySelector("[data-cart-total]");
    const transportNode = container.querySelector("[data-transport-placeholder]");
    const customerForm = container.querySelector("[data-customer-form]");
    const customerStatus = customerForm.querySelector("[data-customer-status]");
    let selectedShipping = null;
    let lastResult = null;
    let requestSequence = 0;

    function updateCustomerRequirements() {
      const required = new Set(requiredCustomerFields(selectedShipping?.mode));
      customerForm.querySelectorAll("[name]").forEach((field) => {
        field.required = required.has(field.name);
      });
      const addressHint = customerForm.querySelector("[data-address-hint]");
      if (addressHint) {
        addressHint.textContent = selectedShipping?.mode === "pickup"
          ? "Adresse facultative pour un retrait à l’élevage."
          : "Adresse requise pour une livraison.";
      }
    }

    function restoreCustomer() {
      const customer = customerStore.get();
      customerForm.querySelectorAll("[name]").forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(customer, field.name)) field.value = customer[field.name];
      });
      updateCustomerRequirements();
    }

    function renderLines(items, quote) {
      linesNode.replaceChildren();
      emptyNode.hidden = items.length > 0;
      items.forEach((item, index) => {
        const serverLine = quote?.lines?.[index];
        const card = element(document, "article", "cart-line");
        card.dataset.lineId = item.lineId;
        const info = element(document, "div", "cart-line__info");
        info.append(element(document, "h2", "cart-line__title", serverLine?.name || "Article du panier"));
        const optionsList = element(document, "dl", "cart-line__options");
        optionRows(item.options).forEach(([key, value]) => {
          optionsList.append(element(document, "dt", "", humanizeOption(key)), element(document, "dd", "", value));
        });
        if (optionsList.children.length) info.append(optionsList);
        const controls = element(document, "div", "cart-line__controls");
        const quantityLabel = element(document, "label", "cart-quantity", "Quantité");
        const quantity = element(document, "input");
        quantity.type = "number";
        quantity.min = "1";
        quantity.max = String(MAX_QUANTITY);
        quantity.step = "1";
        quantity.value = String(item.quantity);
        quantity.dataset.quantity = item.lineId;
        quantityLabel.append(quantity);
        const remove = element(document, "button", "cart-remove", "Supprimer");
        remove.type = "button";
        remove.dataset.remove = item.lineId;
        controls.append(quantityLabel, remove);
        const price = element(document, "div", "cart-line__price");
        price.append(element(document, "span", "cart-line__unit", serverLine ? `${money(serverLine.unitPriceCents)} l’unité` : "Prix en cours de calcul"));
        price.append(element(document, "strong", "", serverLine ? money(serverLine.subtotalCents) : "—"));
        card.append(info, controls, price);
        linesNode.append(card);
      });
    }

    function renderModes(result) {
      const quote = result?.quote;
      const modes = quote?.availableShippingModes || result?.availableModes || [];
      modesNode.replaceChildren();
      for (const mode of modes) {
        const label = element(document, "label", "shipping-choice");
        const input = element(document, "input");
        input.type = "radio";
        input.name = "shipping-mode";
        input.value = mode;
        input.checked = selectedShipping?.mode === mode;
        const copy = element(document, "span", "");
        copy.append(element(document, "strong", "", MODE_LABELS[mode] || mode));
        if (quote?.shipping?.mode === mode) copy.append(element(document, "small", "", money(quote.shipping.priceCents)));
        label.append(input, copy);
        modesNode.append(label);
      }
      if (selectedShipping && !modes.includes(selectedShipping.mode)) selectedShipping = null;
      const parcel = quote?.shippingProfile?.kind === "parcel";
      transportNode.hidden = !parcel;
      transportNode.querySelector("[data-relay-fields]").hidden = selectedShipping?.mode !== "mondial-relay-pickup";
      transportNode.querySelector("[data-home-fields]").hidden = selectedShipping?.mode !== "mondial-relay-home";
      updateCustomerRequirements();
    }

    function renderResult(items, result) {
      lastResult = result;
      const quote = result?.quote;
      renderLines(items, quote);
      renderModes(result);
      subtotalNode.textContent = money(quote?.subtotalCents);
      shippingNode.textContent = quote?.shipping ? money(quote.shipping.priceCents) : "À choisir";
      totalNode.textContent = money(quote?.totalCents);
      const message = quoteStatusMessage(result);
      statusNode.textContent = message;
      statusNode.hidden = !message;
      statusNode.dataset.kind = result?.error || quote?.shippingStatus || "ok";
    }

    async function refresh() {
      const items = store.getItems();
      updateCounters(document, store.count());
      if (!items.length) {
        selectedShipping = null;
        lastResult = null;
        renderLines(items, null);
        modesNode.replaceChildren();
        statusNode.hidden = true;
        transportNode.hidden = true;
        subtotalNode.textContent = money(0);
        shippingNode.textContent = "—";
        totalNode.textContent = money(0);
        return;
      }
      const sequence = ++requestSequence;
      statusNode.hidden = false;
      statusNode.textContent = "Calcul du devis serveur…";
      try {
        const result = await requestQuote(items, selectedShipping, options);
        if (sequence === requestSequence) renderResult(items, result);
      } catch {
        if (sequence === requestSequence) renderResult(items, { error: "quote_unavailable" });
      }
    }

    linesNode.addEventListener("change", (event) => {
      const lineId = event.target.dataset.quantity;
      if (!lineId) return;
      const quantity = Number(event.target.value);
      try { store.updateQuantity(lineId, quantity); } catch { event.target.value = "1"; }
      refresh();
    });
    linesNode.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      store.remove(button.dataset.remove);
      refresh();
    });
    modesNode.addEventListener("change", (event) => {
      if (event.target.name !== "shipping-mode") return;
      selectedShipping = { mode: event.target.value };
      refresh();
    });
    customerForm.addEventListener("input", (event) => {
      if (event.target.name) customerStore.setField(event.target.name, event.target.value);
    });
    customerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      customerStatus.textContent = "Coordonnées enregistrées dans ce navigateur. Aucune commande n’a été créée.";
      customerStatus.hidden = false;
    });

    store.subscribe(() => updateCounters(document, store.count()));
    restoreCustomer();
    refresh();
    return { customerStore, refresh, store, getLastResult: () => lastResult };
  }

  function autoInit(root) {
    const store = createCartStore();
    updateCounters(root.document, store.count());
    if (root.document.querySelector("[data-cart-page]")) mountCartPage(root, { store });
  }

  return {
    MAX_QUANTITY,
    CUSTOMER_FIELDS,
    CUSTOMER_STORAGE_KEY,
    MODE_LABELS,
    STORAGE_KEY,
    STORAGE_VERSION,
    autoInit,
    buildQuotePayload,
    createCartStore,
    createCustomerStore,
    money,
    mountCartPage,
    optionRows,
    parseStoredCart,
    parseStoredCustomer,
    quoteStatusMessage,
    requestQuote,
    requiredCustomerFields,
    safeOptionValue,
    sanitizeLine,
    sanitizeCustomer,
    updateCounters,
    validQuantity
  };
}));
