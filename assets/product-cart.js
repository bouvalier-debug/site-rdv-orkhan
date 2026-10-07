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

  function addLine(store, line) {
    if (!store || typeof store.add !== "function") throw new TypeError("cart_unavailable");
    store.add(line);
    return store.count();
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

  return { addLine, animocoLine, cosmeticLine, engravingLines, quantity, redDingoLine, showAddConfirmation };
}));
