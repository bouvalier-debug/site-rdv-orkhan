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
  const LEGACY_CUSTOMER_STORAGE_KEY = "orkhan-shop-customer-v1";
  const CUSTOMER_STORAGE_KEY = "orkhan-shop-customer-v2";
  const SHOP_LEGAL_CURRENT_VERSION = "cgv-2026-10-05";
  const STORAGE_VERSION = 1;
  const MAX_QUANTITY = 20;
  const EMPTY_SHIPPING_MESSAGE = "Les modes de livraison disponibles s’afficheront selon le contenu de votre panier.";
  const PRICE_KEYS = /^(price|priceCents|unitPrice|unitPriceCents|subtotal|subtotalCents|shipping|shippingCents|total|totalCents)$/i;
  const MODE_LABELS = Object.freeze({
    pickup: "Retrait à l’élevage (gratuit)",
    "animoco-light-fr": "France — La Poste, Lettre verte suivie",
    "animoco-light-be": "Belgique — Mondial Relay, Point Relais ou Locker choisi par email après la commande",
    "mondial-relay-pickup": "Mondial Relay — Point Relais ou Locker",
    "mondial-relay-home": "Mondial Relay — Livraison à domicile",
    "red-dingo-free": "Livraison Red Dingo comprise, expédition directe par Red Dingo"
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

  function validStoredDate(value, maximumAgeDays, now = Date.now()) {
    const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maximumAgeDays * 86_400_000;
  }

  function parseStoredCart(raw, now = Date.now()) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items) || !validStoredDate(parsed.updatedAt, 30, now)) return [];
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
    let items = storage ? parseStoredCart(storage.getItem(STORAGE_KEY), options.now?.() || Date.now()) : [];
    if (storage && !items.length && storage.getItem(STORAGE_KEY)) storage.removeItem(STORAGE_KEY);

    function snapshot() {
      return items.map((item) => ({ ...item, ...(item.options ? { options: safeOptionValue(item.options) } : {}) }));
    }

    function persist() {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: new Date(options.now?.() || Date.now()).toISOString(), items }));
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

    function syncFromStorage() {
      items = storage ? parseStoredCart(storage.getItem(STORAGE_KEY), options.now?.() || Date.now()) : [];
      const state = snapshot();
      listeners.forEach((listener) => listener(state));
      return state;
    }

    return {
      add,
      clear,
      count: () => items.reduce((sum, item) => sum + item.quantity, 0),
      getItems: snapshot,
      remove,
      syncFromStorage,
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

  function parseStoredCustomer(raw, now = Date.now()) {
    if (!raw) return { customer: sanitizeCustomer({}), savedAt: null };
    try {
      const parsed = JSON.parse(raw);
      return parsed?.version === 2 && validStoredDate(parsed.savedAt, 365, now)
        ? { customer: sanitizeCustomer(parsed.customer), savedAt: parsed.savedAt }
        : { customer: sanitizeCustomer({}), savedAt: null };
    } catch {
      return { customer: sanitizeCustomer({}), savedAt: null };
    }
  }

  function createCustomerStore(options = {}) {
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (storage) storage.removeItem(LEGACY_CUSTOMER_STORAGE_KEY);
    const restored = storage ? parseStoredCustomer(storage.getItem(CUSTOMER_STORAGE_KEY), options.now?.() || Date.now()) : { customer: sanitizeCustomer({}), savedAt: null };
    let customer = restored.customer;
    let savedAt = restored.savedAt;
    let remember = Boolean(savedAt);
    if (storage && !savedAt) storage.removeItem(CUSTOMER_STORAGE_KEY);
    function persist() {
      if (storage && remember) storage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ version: 2, savedAt, customer }));
      return { ...customer };
    }
    return {
      get: () => ({ ...customer }),
      isRemembered: () => remember,
      setRemember(value) {
        remember = value === true;
        if (remember) { savedAt ||= new Date(options.now?.() || Date.now()).toISOString(); persist(); }
        else { savedAt = null; if (storage) storage.removeItem(CUSTOMER_STORAGE_KEY); }
        return remember;
      },
      clear() { customer = sanitizeCustomer({}); remember = false; savedAt = null; if (storage) storage.removeItem(CUSTOMER_STORAGE_KEY); return { ...customer }; },
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

  function buildCheckoutPayload(items, shipping, customer, checkoutAttemptId) {
    const payload = buildQuotePayload(items, shipping);
    payload.customer = sanitizeCustomer(customer);
    payload.checkoutAttemptId = checkoutAttemptId;
    payload.legalAcceptance = { version: SHOP_LEGAL_CURRENT_VERSION, accepted: true };
    if (items.some((item) => /^red-dingo:/i.test(item.productId))) payload.engravingConfirmed = true;
    return payload;
  }

  async function requestCheckout(payload, options = {}) {
    const response = await (options.fetch || fetch)(options.url || "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let result;
    try { result = await response.json(); } catch { result = { error: "invalid_server_response" }; }
    if (!response.ok && !result.error) result.error = "checkout_unavailable";
    return result;
  }

  function money(cents) {
    return Number.isInteger(cents)
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
      : "—";
  }

  function quoteStatusMessage(result) {
    const code = result?.error || result?.quote?.shippingStatus;
    if (code === "shipping_unavailable") {
      return "Pour cette commande, seul le retrait à l’élevage est proposé.";
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

  function deliveryDelayLines({ hasRedDingo, hasOther, mode }) {
    const result = [];
    if (hasRedDingo && mode === "pickup") result.push("Médailles gravées : transmission à Red Dingo sous 24 h ouvrées, fabrication sous 7 à 10 jours ouvrés (indicatif), puis retrait à l’élevage sur rendez-vous dès réception.");
    else if (hasRedDingo && ["red-dingo-free", "animoco-light-fr", "animoco-light-be"].includes(mode)) result.push("Médailles gravées : transmission à Red Dingo sous 24 h ouvrées, puis fabrication et expédition par Red Dingo sous 7 à 10 jours ouvrés (indicatif). Livraison comprise.");
    if (hasOther && mode === "animoco-light-fr") result.push("Préparation et expédition sous 48 h ouvrées, puis La Poste Lettre verte suivie : 3 à 5 jours ouvrés (indicatif).");
    else if (hasOther && mode === "animoco-light-be") result.push("Pour une livraison en Belgique, le Point Relais ou Locker Mondial Relay est choisi avec le client par email après la commande. Préparation et expédition sous 48 h ouvrées après votre choix, puis Mondial Relay : 3 à 6 jours ouvrés (indicatif).");
    else if (hasOther && mode === "pickup") result.push("Disponible à l’élevage sous 24 h ouvrées, sur rendez-vous. Vous êtes prévenu par email.");
    if (hasRedDingo && hasOther && mode !== "pickup" && result.length > 1) result.push("Les médailles Red Dingo sont expédiées séparément, directement par Red Dingo.");
    return result;
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
    const customerForm = container.querySelector("[data-customer-form]");
    const customerStatus = customerForm.querySelector("[data-customer-status]");
    const checkoutButton = container.querySelector("[data-checkout-button]");
    const checkoutStatus = container.querySelector("[data-checkout-status]");
    const rememberCustomer = container.querySelector("[data-remember-customer]");
    const clearCustomer = container.querySelector("[data-clear-customer]");
    const legalCheckbox = container.querySelector("[data-legal-acceptance]");
    const engravingWrap = container.querySelector("[data-engraving-confirmation-wrap]");
    const engravingCheckbox = container.querySelector("[data-engraving-confirmation]");
    const delaysNode = container.querySelector("[data-delivery-delays]");
    let selectedShipping = null;
    let lastResult = null;
    let requestSequence = 0;
    let checkoutAttempt = null;

    function newAttemptId() {
      if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
      const bytes = new Uint8Array(16);
      if (root.crypto && typeof root.crypto.getRandomValues === "function") root.crypto.getRandomValues(bytes);
      else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function attemptFor(payload) {
      const signature = JSON.stringify({ items: payload.items, shipping: payload.shipping, customer: payload.customer });
      if (!checkoutAttempt || checkoutAttempt.signature !== signature) {
        checkoutAttempt = { signature, id: newAttemptId() };
      }
      return checkoutAttempt.id;
    }

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
      if (rememberCustomer) rememberCustomer.checked = customerStore.isRemembered();
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
        if (/^red-dingo:/i.test(item.productId)) info.append(element(document, "p", "engraving-warning", "Produit personnalisé : pas de droit de rétractation. Vérifiez le texte de gravure, il sera reproduit exactement."));
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
      if (!modes.length) modesNode.append(element(document, "p", "shipping-empty", EMPTY_SHIPPING_MESSAGE));
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
      const hasRedDingo = items.some((item) => /^red-dingo:/i.test(item.productId));
      const hasOther = items.some((item) => !/^red-dingo:/i.test(item.productId));
      if (engravingWrap) engravingWrap.hidden = !hasRedDingo;
      if (delaysNode) {
        const delays = selectedShipping ? deliveryDelayLines({ hasRedDingo, hasOther, mode: selectedShipping.mode }) : [];
        delaysNode.textContent = delays.length ? delays.join(" ") : "Choisissez un mode de livraison pour afficher les délais.";
      }
    }

    async function refresh() {
      const items = store.getItems();
      updateCounters(document, store.count());
      if (!items.length) {
        selectedShipping = null;
        lastResult = null;
        renderLines(items, null);
        modesNode.replaceChildren(element(document, "p", "shipping-empty", EMPTY_SHIPPING_MESSAGE));
        statusNode.hidden = true;
        if (engravingWrap) engravingWrap.hidden = true;
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
    if (rememberCustomer) rememberCustomer.addEventListener("change", () => customerStore.setRemember(rememberCustomer.checked));
    if (clearCustomer) clearCustomer.addEventListener("click", () => {
      customerStore.clear(); customerForm.reset(); updateCustomerRequirements();
      customerStatus.textContent = "Vos coordonnées enregistrées ont été effacées de ce navigateur."; customerStatus.hidden = false;
    });
    customerForm.addEventListener("submit", (event) => event.preventDefault());
    if (checkoutButton) checkoutButton.addEventListener("click", async () => {
      checkoutStatus.hidden = true;
      if (!store.getItems().length || !selectedShipping || !lastResult?.quote?.totalCents) {
        checkoutStatus.textContent = "Complétez le panier et choisissez un mode de livraison disponible.";
        checkoutStatus.hidden = false;
        return;
      }
      if (!customerForm.checkValidity()) {
        customerForm.reportValidity();
        return;
      }
      if (!legalCheckbox?.checked) { checkoutStatus.textContent = "Veuillez accepter les conditions générales de vente pour continuer."; checkoutStatus.hidden = false; return; }
      if (!engravingWrap?.hidden && !engravingCheckbox?.checked) { checkoutStatus.textContent = "Veuillez confirmer avoir vérifié le texte de gravure de vos médailles Red Dingo."; checkoutStatus.hidden = false; return; }
      const basePayload = buildCheckoutPayload(store.getItems(), selectedShipping, customerStore.get(), "");
      basePayload.checkoutAttemptId = attemptFor(basePayload);
      checkoutButton.disabled = true;
      checkoutStatus.textContent = "Préparation du paiement sécurisé…";
      checkoutStatus.hidden = false;
      try {
        const result = await requestCheckout(basePayload, options);
        if (!result.ok || typeof result.checkoutUrl !== "string") throw new Error(result.error || "checkout_unavailable");
        root.location.assign(result.checkoutUrl);
      } catch (error) {
        if (error.message === "legal_version_outdated") {
          legalCheckbox.checked = false;
          checkoutStatus.innerHTML = 'Les conditions générales de vente ont été mises à jour. Merci de les relire et de les accepter à nouveau. <button type="button" data-reload>Recharger la page</button>';
          checkoutStatus.querySelector("[data-reload]")?.addEventListener("click", () => root.location.reload());
        } else checkoutStatus.textContent = "Le paiement ne peut pas être préparé pour le moment. Réessayez dans quelques instants.";
        checkoutButton.disabled = false;
      }
    });

    store.subscribe(() => updateCounters(document, store.count()));
    restoreCustomer();
    refresh();
    return { customerStore, refresh, store, getLastResult: () => lastResult };
  }

  function autoInit(root) {
    const store = createCartStore({ storage: root.localStorage });
    updateCounters(root.document, store.count());
    if (root.document.querySelector("[data-cart-page]")) mountCartPage(root, { store });
    if (typeof root.addEventListener === "function") {
      root.addEventListener("storage", (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        store.syncFromStorage();
        updateCounters(root.document, store.count());
      });
    }
  }

  return {
    MAX_QUANTITY,
    CUSTOMER_FIELDS,
    CUSTOMER_STORAGE_KEY,
    LEGACY_CUSTOMER_STORAGE_KEY,
    SHOP_LEGAL_CURRENT_VERSION,
    EMPTY_SHIPPING_MESSAGE,
    MODE_LABELS,
    STORAGE_KEY,
    STORAGE_VERSION,
    autoInit,
    buildQuotePayload,
    buildCheckoutPayload,
    createCartStore,
    createCustomerStore,
    deliveryDelayLines,
    validStoredDate,
    money,
    mountCartPage,
    optionRows,
    parseStoredCart,
    parseStoredCustomer,
    quoteStatusMessage,
    requestQuote,
    requestCheckout,
    requiredCustomerFields,
    safeOptionValue,
    sanitizeLine,
    sanitizeCustomer,
    updateCounters,
    validQuantity
  };
}));
