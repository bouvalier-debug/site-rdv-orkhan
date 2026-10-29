(function recipeFilters(root) {
  "use strict";

  // Profils cochés : logique OU entre eux, ET avec la marque. Un produit sans marque ni profil (non renseigné) n'est visible que lorsqu'aucun filtre n'est actif.
  function matches(tile, brand, profiles) {
    if (!brand && !profiles.length) return true;
    if (brand && (tile.brand || "") !== brand) return false;
    const own = (tile.profile || "").split(/\s+/).filter(Boolean);
    return !profiles.length || profiles.some((token) => own.includes(token));
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { matches };
  if (typeof document === "undefined") return;

  const form = document.querySelector("[data-recipe-filters]");
  if (!form) return;
  const section = form.parentElement;
  const grid = section.querySelector(".product-grid");
  const empty = section.querySelector("[data-recipe-empty]");
  const count = form.querySelector("[data-recipe-count]");
  const select = form.elements.brand;
  const checks = [...form.querySelectorAll('input[name="profile"]')];
  const tiles = grid ? [...grid.querySelectorAll(".product-tile")] : [];
  form.hidden = false;

  function apply() {
    const brand = select ? select.value : "";
    const profiles = checks.filter((check) => check.checked).map((check) => check.value);
    let shown = 0;
    for (const tile of tiles) {
      const visible = matches({ brand: tile.dataset.brand, profile: tile.dataset.profile }, brand, profiles);
      tile.hidden = !visible;
      if (visible) shown += 1;
    }
    const filtered = Boolean(brand) || profiles.length > 0;
    if (empty) empty.hidden = shown > 0;
    if (count) count.textContent = filtered ? `${shown} recette${shown > 1 ? "s" : ""} sur ${tiles.length}` : "";
  }

  form.addEventListener("change", apply);
  form.addEventListener("submit", (event) => event.preventDefault());
  form.querySelector("[data-recipe-reset]").addEventListener("click", () => {
    form.reset();
    apply();
  });
  apply();
})(typeof window !== "undefined" ? window : globalThis);
