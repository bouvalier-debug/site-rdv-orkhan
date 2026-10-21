// Menu Rayons commun aux pages Boutique (phase 6) : se referme au clic hors du menu ou avec Échap. Sans ce script, le
// <details> reste pleinement utilisable.
(function shopMenu() {
  "use strict";
  const menu = document.querySelector(".shop-rayons");
  if (!menu) return;
  document.addEventListener("click", (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
  });
}());
