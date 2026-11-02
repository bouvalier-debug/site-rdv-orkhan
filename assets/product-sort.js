(function productSort(root) {
  "use strict";

  const OPTIONS = ["defaut", "prix-asc", "prix-desc", "recents", "nom-asc", "nom-desc"];
  const FAMILY_STORAGE_KEY = "orkhan-shop-family-chip-v1";
  const FAMILY_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

  // Prix réellement applicable : le prix Famille d'un client reconnu (s'il existe pour l'article), sinon le prix public.
  function applicablePrice(tile, family) {
    const publicPrice = Number(tile.price);
    const familyPrice = tile.familyPrice === undefined || tile.familyPrice === "" ? NaN : Number(tile.familyPrice);
    return family && Number.isFinite(familyPrice) ? familyPrice : publicPrice;
  }

  const byOrder = (a, b) => Number(a.order) - Number(b.order);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "fr", { sensitivity: "base", numeric: true });

  // Tri stable de toutes les cartes (visibles ou masquées par les filtres) ; l'ordre par défaut est celui du Manager.
  function sortItems(items, mode, family) {
    const list = items.slice();
    const price = (item) => applicablePrice(item, family);
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
  const items = tiles.map((tile) => ({ tile, price: tile.dataset.price, familyPrice: tile.dataset.familyPrice, published: tile.dataset.published, name: tile.dataset.name, order: tile.dataset.order }));
  let family = false;
  bar.hidden = false;

  function apply() {
    const mode = select.value;
    for (const item of sortItems(items, mode, family)) grid.appendChild(item.tile);
    if (note) note.textContent = family && mode.startsWith("prix") ? "Tri sur vos prix Famille Dynastie." : "";
    try {
      const url = new URL(root.location.href);
      if (mode === "defaut") url.searchParams.delete("tri"); else url.searchParams.set("tri", mode);
      root.history.replaceState(null, "", url);
    } catch { /* adresse non modifiable : le tri reste appliqué */ }
  }

  // Un numéro de puce ou un code Famille déjà saisi au panier (moins de 30 jours) est vérifié une seule fois, au premier tri par prix.
  let familyChecked = false;
  async function checkFamily() {
    if (familyChecked) return;
    familyChecked = true;
    try {
      const saved = JSON.parse(root.localStorage.getItem(FAMILY_STORAGE_KEY) || "null");
      const fresh = saved && saved.version === 1 && Date.now() - Date.parse(saved.savedAt) < FAMILY_MAX_AGE_MS;
      const proof = fresh ? String(saved.chipNumber || "").trim() : "";
      if (!proof) return;
      // Même règle que le panier : une saisie avec des lettres est un code Famille, sinon un numéro de puce.
      const response = await root.fetch("/api/family-eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(/[a-z]/i.test(proof) ? { familyCode: proof } : { chipNumber: proof }) });
      if (response.ok) family = (await response.json()).recognized === true;
    } catch { family = false; }
  }

  select.addEventListener("change", async () => {
    if (select.value.startsWith("prix")) await checkFamily();
    apply();
  });

  const requested = new URL(root.location.href).searchParams.get("tri");
  if (OPTIONS.includes(requested) && requested !== "defaut") {
    select.value = requested;
    (requested.startsWith("prix") ? checkFamily() : Promise.resolve()).then(apply);
  }
})(typeof window !== "undefined" ? window : globalThis);
