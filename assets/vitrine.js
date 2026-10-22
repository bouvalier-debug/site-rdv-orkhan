// Fiche produit de la Boutique : variantes du Manager, galerie et ajout au panier partagé.
// Seules la référence et la quantité sont stockées ; prix, stock et tarif Famille sont recontrôlés côté serveur.
(function vitrine() {
  "use strict";
  const fiche = document.querySelector("[data-fiche]");
  const dataNode = document.getElementById("fiche-variants");
  if (!fiche || !dataNode) return;
  const variants = JSON.parse(dataNode.textContent);
  const byReference = new Map(variants.map((variant) => [variant.reference, variant]));
  const axisFields = [...fiche.querySelectorAll("[data-variant-axis]")];
  const priceNode = fiche.querySelector("[data-fiche-price]");
  const familyNode = fiche.querySelector("[data-fiche-family]");
  const availabilityNode = fiche.querySelector("[data-fiche-availability]");
  const referenceNode = fiche.querySelector("[data-fiche-ref]");
  const quantityInput = fiche.querySelector("[data-fiche-quantity]");
  const addButton = fiche.querySelector("[data-fiche-add]");
  const mainPhoto = fiche.querySelector("[data-fiche-photo]");
  const thumbs = fiche.querySelector("[data-fiche-thumbs]");
  let current = byReference.get(referenceNode?.textContent) || variants[0];

  function showPhoto(photo) {
    if (!mainPhoto || !photo) return;
    mainPhoto.src = photo.url;
    mainPhoto.alt = photo.altText;
    for (const dimension of ["width", "height"]) {
      if (Number.isSafeInteger(photo[dimension]) && photo[dimension] > 0) mainPhoto.setAttribute(dimension, String(photo[dimension]));
      else mainPhoto.removeAttribute(dimension);
    }
  }

  function showGallery(variant) {
    const photos = variant.photos || [];
    if (!photos.length || !mainPhoto) return;
    showPhoto(photos[0]);
    if (!thumbs) return;
    thumbs.replaceChildren();
    photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.photoIndex = String(index);
      if (index === 0) button.setAttribute("aria-current", "true");
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = photo.altText;
      image.loading = "lazy";
      button.append(image);
      thumbs.append(button);
    });
    thumbs.hidden = photos.length < 2;
  }

  function syncAxes() {
    axisFields.forEach((field, index) => {
      field.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.checked = input.value === current.variantOptions[index].value;
        input.disabled = !variants.some((variant) => variant.variantOptions[index].value === input.value
          && variant.variantOptions.slice(0, index).every((option, previous) => option.value === current.variantOptions[previous].value));
      });
    });
  }

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
    if (axisFields.length) syncAxes();
    showGallery(variant);
  }

  function selectAxis(index, value) {
    const candidates = variants.filter((variant) => variant.variantOptions[index].value === value
      && variant.variantOptions.slice(0, index).every((option, previous) => option.value === current.variantOptions[previous].value));
    let best = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const score = candidate.variantOptions.slice(index + 1).filter((option, offset) => option.value === current.variantOptions[index + offset + 1].value).length;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (best) select(best);
  }

  fiche.addEventListener("change", (event) => {
    const input = event.target;
    if (input.name === "variant" && byReference.has(input.value)) select(byReference.get(input.value));
    else if (input.name?.startsWith("variant-axis-") && !input.disabled) {
      const index = Number(input.name.slice("variant-axis-".length));
      if (Number.isInteger(index) && index >= 0 && index < axisFields.length) selectAxis(index, input.value);
    }
  });

  thumbs?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-photo-index]");
    if (!button || !thumbs.contains(button)) return;
    const photo = current.photos[Number(button.dataset.photoIndex)];
    if (!photo) return;
    showPhoto(photo);
    thumbs.querySelectorAll("button").forEach((other) => other.toggleAttribute("aria-current", other === button));
  });

  if (addButton) addButton.addEventListener("click", () => {
    const cart = window.OrkhanCart; const productCart = window.OrkhanProductCart;
    if (!cart || !productCart || !current.maxQuantity) return;
    try {
      const quantity = Math.min(Math.max(Number(quantityInput?.value) || 1, 1), current.maxQuantity);
      const store = cart.createCartStore();
      productCart.addLineGuarded(store, productCart.catalogueLine(current.reference, quantity), { button: addButton, onAdded() {
        cart.updateCounters(document, store.count());
        productCart.showAddConfirmation(addButton, `${fiche.querySelector("h1").textContent} ajouté au panier.`, fiche.querySelector(".product-cart-confirmation"));
      } });
    } catch {
      productCart.showAddConfirmation(addButton, "Ce produit n’a pas pu être ajouté au panier.", fiche.querySelector(".product-cart-confirmation"));
    }
  });
}());
