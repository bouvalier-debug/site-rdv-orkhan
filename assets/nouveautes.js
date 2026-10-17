(function nouveautesModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OrkhanNouveautes = api;
  if (root && root.document && root.fetch) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => api.autoInit(root));
    } else {
      api.autoInit(root);
    }
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createNouveautesModule() {
  "use strict";

  // Nouveaux produits du catalogue Manager. Lot 2 : un produit que le Manager indique achetable peut être ajouté au
  // panier ; le prix, la disponibilité et le stock sont recontrôlés côté serveur au devis puis à la commande.
  // Les autres restent affichés à titre informatif.

  const NOT_FOR_SALE = "Bientôt disponible — pas encore en vente";
  const OUT_OF_STOCK = "Rupture de stock";
  const PICKUP_ONLY = "Retrait sur place à l’élevage";
  const MESSAGES = {
    loading: "Chargement des nouveautés…",
    unavailable: "Les nouveautés sont momentanément indisponibles. Les autres produits de la boutique restent disponibles à la commande.",
    empty: "Aucune nouveauté pour le moment. Revenez bientôt !"
  };

  function formatPrice(cents) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
  }

  function statusMessage(data) {
    if (!data || data.available !== true) return MESSAGES.unavailable;
    return Array.isArray(data.products) && data.products.length ? "" : MESSAGES.empty;
  }

  function saleState(product) {
    const reference = typeof product.reference === "string" ? product.reference : "";
    if (product.purchasable !== true || !reference) return { reference, buyable: false, availability: NOT_FOR_SALE };
    const maxQuantity = Number.isInteger(product.maxOrderQuantity) ? product.maxOrderQuantity : 0;
    return maxQuantity > 0
      ? { reference, buyable: true, maxQuantity, availability: PICKUP_ONLY }
      : { reference, buyable: false, availability: OUT_OF_STOCK };
  }

  // Modèle d'affichage : ne garde que des champs publics ; l'achat n'est proposé que sur indication du Manager.
  function describeProducts(data) {
    if (!data || data.available !== true || !Array.isArray(data.products)) return [];
    return data.products.filter((product) => product && typeof product.name === "string" && Number.isInteger(product.publicPriceCents)).map((product) => ({
      name: product.name,
      description: typeof product.description === "string" ? product.description : "",
      price: formatPrice(product.publicPriceCents),
      familyPrice: Number.isInteger(product.familyPriceCents) ? formatPrice(product.familyPriceCents) : null,
      photos: (Array.isArray(product.photos) ? product.photos : [])
        .filter((photo) => typeof photo?.url === "string" && photo.url.startsWith("/api/catalogue-photo?id="))
        .map((photo) => ({ url: photo.url, alt: typeof photo.altText === "string" ? photo.altText : product.name, width: photo.width, height: photo.height })),
      ...saleState(product)
    }));
  }

  function element(document, tag, className, textValue) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = textValue;
    return node;
  }

  function renderCatalogue(document, container, status, data) {
    const products = describeProducts(data);
    const message = statusMessage(data);
    status.textContent = message;
    status.hidden = !message;
    container.replaceChildren(...products.map((product) => {
      const card = element(document, "article", "product-card new-product-card");
      if (product.photos.length) {
        const [main, ...others] = product.photos;
        const image = element(document, "img", "new-product-photo");
        image.src = main.url; image.alt = main.alt; image.loading = "lazy";
        if (main.width && main.height) { image.width = main.width; image.height = main.height; }
        card.append(image);
        if (others.length) {
          const thumbnails = element(document, "div", "new-product-thumbnails");
          thumbnails.append(...others.map((photo) => { const thumb = element(document, "img"); thumb.src = photo.url; thumb.alt = photo.alt; thumb.loading = "lazy"; return thumb; }));
          card.append(thumbnails);
        }
      }
      const body = element(document, "div", "card-body");
      body.append(element(document, "p", "not-for-sale", product.availability));
      body.append(element(document, "h2", null, product.name));
      if (product.description) body.append(element(document, "p", "new-product-description", product.description));
      body.append(element(document, "p", "price", `Prix : ${product.price}`));
      if (product.familyPrice) body.append(element(document, "p", "family-price", `Prix famille Dynastie : ${product.familyPrice}`));
      if (product.buyable) {
        const button = element(document, "button", "btn-primary add-to-cart", "Ajouter au panier");
        button.type = "button";
        button.dataset.catalogueReference = product.reference;
        body.append(button);
      }
      card.append(body);
      return card;
    }));
    return products.length;
  }

  async function loadCatalogue(fetchImpl) {
    try {
      const response = await fetchImpl("/api/catalogue-produits", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) return { available: false, products: [] };
      return await response.json();
    } catch {
      return { available: false, products: [] };
    }
  }

  // Ajout au panier partagé de la Boutique (mêmes composants que les autres pages produits).
  function addToCart(root, button) {
    const cart = root.OrkhanCart; const productCart = root.OrkhanProductCart;
    if (!cart || !productCart) return false;
    try {
      const store = cart.createCartStore();
      productCart.addLine(store, productCart.catalogueLine(button.dataset.catalogueReference, 1));
      cart.updateCounters(root.document, store.count());
      const name = button.closest("article")?.querySelector("h2")?.textContent || "Produit";
      productCart.showAddConfirmation(button, `${name} ajouté au panier.`);
      return true;
    } catch {
      productCart.showAddConfirmation(button, "Ce produit n’a pas pu être ajouté au panier.");
      return false;
    }
  }

  async function autoInit(root) {
    const container = root.document.getElementById("nouveautes-produits");
    const status = root.document.getElementById("nouveautes-statut");
    if (!container || !status) return;
    status.textContent = MESSAGES.loading;
    status.hidden = false;
    renderCatalogue(root.document, container, status, await loadCatalogue(root.fetch.bind(root)));
    container.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-catalogue-reference]");
      if (button) addToCart(root, button);
    });
  }

  return { MESSAGES, NOT_FOR_SALE, OUT_OF_STOCK, PICKUP_ONLY, addToCart, autoInit, describeProducts, formatPrice, loadCatalogue, renderCatalogue, saleState, statusMessage };
}));
