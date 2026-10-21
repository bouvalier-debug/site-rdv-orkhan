// Bouton « Retour en haut » commun aux pages Boutique (Lot A, K5) : visible après 500 px de défilement.
(function backToTop() {
  "use strict";
  const button = document.getElementById("to-top");
  if (!button) return;
  window.addEventListener("scroll", () => button.classList.toggle("visible", window.scrollY > 500), { passive: true });
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}());
