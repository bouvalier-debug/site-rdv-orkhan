(function productSort(root) {
  "use strict";

  const OPTIONS = ["defaut", "prix-asc", "prix-desc", "recents", "nom-asc", "nom-desc"];
  // Étape 2 : prix public unique pour tous ; l'avantage Famille est une remise globale du panier, sans effet sur le tri.
  function applicablePrice(tile) {
    return Number(tile.price);
  }

  const byOrder = (a, b) => Number(a.order) - Number(b.order);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "fr", { sensitivity: "base", numeric: true });

  // Tri stable de toutes les cartes (visibles ou masquées par les filtres) ; l'ordre par défaut est celui du Manager.
  function sortItems(items, mode) {
    const list = items.slice();
    const price = (item) => applicablePrice(item);
    const compare = {
      "prix-asc": (a, b) => price(a) - price(b) || byOrder(a, b),
      "prix-desc": (a, b) => price(b) - price(a) || byOrder(a, b),
      recents: (a, b) => String(b.published || "").localeCompare(String(a.published || "")) || byOrder(a, b),
      "nom-asc": (a, b) => byName(a, b) || byOrder(a, b),
      "nom-desc": (a, b) => byName(b, a) || byOrder(a, b)
    }[mode] || byOrder;
    return list.sort(compare);
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { OPTIONS, applicablePrice, sortItems };
  if (typeof document === "undefined") return;

  const bar = document.querySelector("[data-sort-bar]");
  if (!bar) return;
  const grid = bar.parentElement.querySelector(".product-grid");
  const select = bar.querySelector("select");
  const note = bar.querySelector("[data-sort-note]");
  if (!grid || !select) return;
  const tiles = [...grid.querySelectorAll(".product-tile")];
  const items = tiles.map((tile) => ({ tile, price: tile.dataset.price, published: tile.dataset.published, name: tile.dataset.name, order: tile.dataset.order }));
  bar.hidden = false;

  function apply() {
    const mode = select.value;
    for (const item of sortItems(items, mode)) grid.appendChild(item.tile);
    if (note) note.textContent = "";
    try {
      const url = new URL(root.location.href);
      if (mode === "defaut") url.searchParams.delete("tri"); else url.searchParams.set("tri", mode);
      root.history.replaceState(null, "", url);
    } catch { /* adresse non modifiable : le tri reste appliqué */ }
  }

  select.addEventListener("change", apply);

  const requested = new URL(root.location.href).searchParams.get("tri");
  if (OPTIONS.includes(requested) && requested !== "defaut") {
    select.value = requested;
    apply();
  }
})(typeof window !== "undefined" ? window : globalThis);
