// Ajout rapide au panier depuis les cartes produits : un clic ajoute une unité de la référence affichée, sans quitter la
// page. Réutilise le panier commun (OrkhanCart) et l'ajout contrôlé des fiches (OrkhanProductCart) : même stockage, même
// contrôle du mélange avec les médailles Red Dingo ; le prix, le stock et la disponibilité sont recontrôlés au devis.
(function quickAdd(root) {
  "use strict";

  // Quantité déjà au panier pour cette référence, et ligne simple (sans option) à compléter s'il y en a une.
  function cartState(items, reference) {
    const lines = items.filter((item) => item.productId === reference);
    return { quantity: lines.reduce((sum, item) => sum + item.quantity, 0), line: lines.find((item) => !item.options) || null };
  }

  function quickAddClick(button, { cart, productCart, document }) {
    const reference = button.dataset.quickAdd;
    const max = Math.min(Number(button.dataset.quickMax) || 0, 20);
    const status = button.closest(".product-tile")?.querySelector("[data-quick-status]") || null;
    const say = (text, kind) => {
      if (!status) return;
      status.textContent = text;
      status.dataset.kind = kind;
      clearTimeout(status._timer);
      status._timer = setTimeout(() => { status.textContent = ""; delete status.dataset.kind; }, 2200);
    };
    const store = cart.createCartStore();
    const { quantity, line } = cartState(store.getItems(), reference);
    if (!max || quantity >= max) return say("Quantité maximale disponible déjà au panier.", "warn");
    const added = () => {
      cart.updateCounters(document, store.count());
      button.classList.add("is-added");
      clearTimeout(button._timer);
      button._timer = setTimeout(() => button.classList.remove("is-added"), 1600);
      say("Ajouté au panier", "ok");
    };
    if (line) {
      store.updateQuantity(line.lineId, line.quantity + 1);
      added();
      return "added";
    }
    return productCart.addLineGuarded(store, productCart.catalogueLine(reference, 1), { button, onAdded: added });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { cartState, quickAddClick };
  if (typeof document === "undefined") return;

  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("[data-quick-add]");
    if (!button) return;
    event.preventDefault();
    const cart = root.OrkhanCart;
    const productCart = root.OrkhanProductCart;
    if (!cart || !productCart) return;
    try {
      quickAddClick(button, { cart, productCart, document });
    } catch {
      const status = button.closest(".product-tile")?.querySelector("[data-quick-status]");
      if (status) { status.textContent = "Ce produit n’a pas pu être ajouté au panier."; status.dataset.kind = "warn"; }
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
