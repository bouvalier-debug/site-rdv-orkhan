// Fiche produit de la Boutique (phase 6, C5 / CAT-02) : choix du format, galerie photo et ajout au panier partagé.
// Seules la référence et la quantité sont stockées ; prix, stock et tarif Famille sont recontrôlés côté serveur.
(function vitrine() {
  "use strict";
  const fiche = document.querySelector("[data-fiche]");
  const dataNode = document.getElementById("fiche-variants");
  if (!fiche || !dataNode) return;
  const variants = JSON.parse(dataNode.textContent);
  const byReference = new Map(variants.map((variant) => [variant.reference, variant]));
  const priceNode = fiche.querySelector("[data-fiche-price]");
  const familyNode = fiche.querySelector("[data-fiche-family]");
  const availabilityNode = fiche.querySelector("[data-fiche-availability]");
  const referenceNode = fiche.querySelector("[data-fiche-ref]");
  const quantityInput = fiche.querySelector("[data-fiche-quantity]");
  const addButton = fiche.querySelector("[data-fiche-add]");
  let current = byReference.get(referenceNode?.textContent) || variants[0];

  function select(variant) {
    current = variant;
    if (priceNode) priceNode.textContent = variant.price;
    if (familyNode) { familyNode.hidden = !variant.familyPrice; familyNode.querySelector("span").textContent = variant.familyPrice || ""; }
    if (availabilityNode) { availabilityNode.textContent = variant.availability; availabilityNode.className = `availability availability-${variant.state}`; }
    if (referenceNode) referenceNode.textContent = variant.reference;
    if (quantityInput) {
      quantityInput.max = String(Math.max(variant.maxQuantity, 1));
      quantityInput.value = String(Math.min(Number(quantityInput.value) || 1, Math.max(variant.maxQuantity, 1)));
      quantityInput.disabled = !variant.maxQuantity;
    }
    if (addButton) addButton.disabled = !variant.maxQuantity;
  }

  fiche.addEventListener("change", (event) => {
    if (event.target.name === "variant" && byReference.has(event.target.value)) select(byReference.get(event.target.value));
  });

  const mainPhoto = fiche.querySelector("[data-fiche-photo]");
  fiche.querySelectorAll(".fiche-thumbs button").forEach((button) => button.addEventListener("click", () => {
    if (!mainPhoto) return;
    mainPhoto.src = button.dataset.photo;
    mainPhoto.alt = button.dataset.alt;
    mainPhoto.removeAttribute("width"); mainPhoto.removeAttribute("height");
    fiche.querySelectorAll(".fiche-thumbs button").forEach((other) => other.toggleAttribute("aria-current", other === button));
  }));

  if (addButton) addButton.addEventListener("click", () => {
    const cart = window.OrkhanCart; const productCart = window.OrkhanProductCart;
    if (!cart || !productCart || !current.maxQuantity) return;
    try {
      const quantity = Math.min(Math.max(Number(quantityInput?.value) || 1, 1), current.maxQuantity);
      const store = cart.createCartStore();
      productCart.addLine(store, productCart.catalogueLine(current.reference, quantity));
      cart.updateCounters(document, store.count());
      productCart.showAddConfirmation(addButton, `${fiche.querySelector("h1").textContent} ajouté au panier.`, fiche.querySelector(".product-cart-confirmation"));
    } catch {
      productCart.showAddConfirmation(addButton, "Ce produit n’a pas pu être ajouté au panier.", fiche.querySelector(".product-cart-confirmation"));
    }
  });
}());
