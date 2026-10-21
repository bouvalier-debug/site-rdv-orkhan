(function productCartModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OrkhanProductCart = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createProductCartModule() {
  "use strict";

  function quantity(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) throw new RangeError("invalid_quantity");
    return parsed;
  }

  function engravingLines(value) {
    if (typeof value !== "string") return [];
    return value.replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  }

  function animocoLine(input = {}) {
    const chipNumber = typeof input.chipNumber === "string" ? input.chipNumber.trim() : "";
    const options = {};
    if (chipNumber) options.chipNumber = chipNumber;
    if (input.familyEligible === true) options.familyEligible = true;
    return {
      productId: "animoco",
      quantity: quantity(input.quantity),
      ...(Object.keys(options).length ? { options } : {})
    };
  }

  function redDingoLine(input = {}) {
    const reference = typeof input.reference === "string" ? input.reference.trim().toUpperCase() : "";
    const size = typeof input.size === "string" ? input.size.trim().toUpperCase() : "";
    const colour = typeof input.colour === "string" ? input.colour.trim() : "";
    const frontLines = engravingLines(input.frontEngraving);
    const backLines = engravingLines(input.backEngraving);
    if (!reference || !size) throw new TypeError("invalid_red_dingo_options");
    if (backLines.some(Boolean) && input.doubleSided !== true) throw new TypeError("red_dingo_back_not_allowed");
    return {
      productId: `red-dingo:${reference}`,
      quantity: quantity(input.quantity),
      options: {
        size,
        colour,
        frontLines,
        ...(backLines.some(Boolean) ? { backLines } : {})
      }
    };
  }

  function cosmeticLine(productId, value = 1) {
    const normalized = typeof productId === "string" ? productId.trim() : "";
    if (!normalized) throw new TypeError("invalid_cosmetic_product");
    return { productId: normalized.startsWith("cosmetics:") ? normalized : `cosmetics:${normalized}`, quantity: quantity(value) };
  }

  // Produit du catalogue Manager (lot 2) : seule la référence et la quantité sont stockées ; le prix vient du devis.
  function catalogueLine(reference, value = 1) {
    const normalized = typeof reference === "string" ? reference.trim() : "";
    if (!/^[a-z0-9]+([-:][a-z0-9]+)*$/.test(normalized) || normalized === "animoco" || /^(cosmetics|red-dingo):/.test(normalized)) {
      throw new TypeError("invalid_catalogue_product");
    }
    return { productId: normalized, quantity: quantity(value) };
  }

  function addLine(store, line) {
    if (!store || typeof store.add !== "function") throw new TypeError("cart_unavailable");
    store.add(line);
    return store.count();
  }

  // Lot A1 : une commande Red Dingo ne se mélange pas avec d'autres articles (fabricant distinct, expédition directe).
  const isRedDingo = (productId) => /^red-dingo:/i.test(String(productId || ""));

  function mixConflict(store, line) {
    const items = store && typeof store.getItems === "function" ? store.getItems() : [];
    if (!items.length) return null;
    const incoming = isRedDingo(line.productId);
    if (incoming && items.some((item) => !isRedDingo(item.productId))) return "cart-has-other";
    if (!incoming && items.some((item) => isRedDingo(item.productId))) return "cart-has-red-dingo";
    return null;
  }

  const CONFLICT_MESSAGES = Object.freeze({
    "cart-has-other": "Les médailles Red Dingo gravées sont fabriquées et expédiées directement par Red Dingo : elles se commandent séparément des autres articles. Votre panier contient déjà d’autres articles.",
    "cart-has-red-dingo": "Votre panier contient des médailles Red Dingo gravées, fabriquées et expédiées directement par Red Dingo : elles se commandent séparément des autres articles."
  });

  // Ajoute la ligne, ou, en cas de mélange, demande de conserver le panier actuel ou de le remplacer (jamais de
  // suppression silencieuse). Retourne « added » ou « conflict » ; onAdded est appelé après l'ajout effectif.
  function addLineGuarded(store, line, { button, onAdded } = {}) {
    const conflict = mixConflict(store, line);
    if (!conflict) { addLine(store, line); if (onAdded) onAdded(); return "added"; }
    if (!button || !button.ownerDocument) throw new TypeError("confirmation_button_required");
    const document = button.ownerDocument;
    button.parentNode.querySelectorAll(".cart-conflict").forEach((node) => node.remove());
    const panel = document.createElement("div");
    panel.className = "cart-conflict";
    panel.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.textContent = CONFLICT_MESSAGES[conflict];
    const actions = document.createElement("div");
    actions.className = "cart-conflict__actions";
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "button secondary";
    keep.textContent = "Conserver mon panier actuel";
    keep.addEventListener("click", () => panel.remove());
    const replace = document.createElement("button");
    replace.type = "button";
    replace.className = "button";
    replace.textContent = "Remplacer mon panier par cet article";
    replace.addEventListener("click", () => {
      store.clear();
      addLine(store, line);
      panel.remove();
      if (onAdded) onAdded();
    });
    actions.append(keep, replace);
    panel.append(text, actions);
    button.insertAdjacentElement("afterend", panel);
    return "conflict";
  }

  function showAddConfirmation(button, message, existingNode) {
    if (!button || !button.ownerDocument) throw new TypeError("confirmation_button_required");
    const document = button.ownerDocument;
    const node = existingNode || document.createElement("p");
    if (!existingNode) button.insertAdjacentElement("afterend", node);
    node.className = "product-cart-confirmation";
    node.setAttribute("role", "status");
    node.replaceChildren(document.createTextNode(`${message} `));
    const link = document.createElement("a");
    link.href = "/panier/";
    link.textContent = "Voir mon panier";
    node.append(link);
    node.hidden = false;
    return node;
  }

  return { addLine, addLineGuarded, mixConflict, animocoLine, catalogueLine, cosmeticLine, engravingLines, quantity, redDingoLine, showAddConfirmation };
}));
