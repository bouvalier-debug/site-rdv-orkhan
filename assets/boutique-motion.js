// Boutique 2.0 : finitions d'interface de la vitrine. Aucune donnée ni règle commerciale ici ; sans ce script,
// toutes les pages restent complètes et utilisables (les repères, liens et contenus sont dans le HTML et le CSS).
(function boutiqueMotion() {
  "use strict";
  var root = document.documentElement;

  // 1. Photo réellement indisponible : on retire la vignette vide et on affiche l'état de remplacement.
  function missing(img) {
    var box = img.parentElement;
    if (!box || !img.closest(".vitrine")) return;
    var group = box.parentElement;
    if (group && /(^|\s)(rayon-shots|page-head-shots)(\s|$)/.test(group.className)) {
      box.remove();
      if (!group.querySelector("span")) group.classList.add("is-empty");
      return;
    }
    if (/(^|\s)(product-tile-photo|brand-card-photo|fiche-plate)(\s|$)/.test(box.className)) box.classList.add("photo-missing");
  }
  document.addEventListener("error", function (event) {
    if (event.target && event.target.tagName === "IMG") missing(event.target);
  }, true);
  document.addEventListener("load", function (event) {
    var target = event.target;
    if (target && target.tagName === "IMG" && target.parentElement) target.parentElement.classList.remove("photo-missing");
  }, true);
  // Images en échec avant le chargement de ce script : vérifiées par une vraie tentative, jamais sur un simple indice.
  Array.prototype.forEach.call(document.querySelectorAll(".vitrine img"), function (img) {
    if (!img.complete || img.naturalWidth > 0 || !img.getAttribute("src")) return;
    var probe = new Image();
    probe.onerror = function () { missing(img); };
    probe.src = img.currentSrc || img.src;
  });

  // 2. Armoire des rayons : le dernier rayon survolé (ou ciblé au clavier) reste exposé dans l'arche.
  var grid = document.querySelector(".rayon-grid");
  if (grid) {
    var tiles = Array.prototype.slice.call(grid.querySelectorAll(".rayon-tile"));
    var activate = function (tile) { tiles.forEach(function (other) { other.classList.toggle("is-active", other === tile); }); };
    if (tiles.length) {
      grid.classList.add("js-active");
      activate(tiles[0]);
      tiles.forEach(function (tile) {
        tile.addEventListener("pointerenter", function () { activate(tile); });
        tile.addEventListener("mouseenter", function () { activate(tile); });
        tile.addEventListener("focus", function () { activate(tile); });
      });
    }
  }

  // 3. Relief du cartouche Avantage Famille : légère inclinaison et lumière sous le pointeur (souris uniquement).
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!calm && hover) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tilt]"), function (card) {
      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--ry", ((x - 0.5) * 3).toFixed(2) + "deg");
        card.style.setProperty("--rx", ((0.5 - y) * 5).toFixed(2) + "deg");
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () {
        ["--rx", "--ry", "--mx", "--my"].forEach(function (name) { card.style.removeProperty(name); });
      });
    });
  }

  // 4. Mobile : les boutons flottants ne recouvrent pas les produits. Facebook n'apparaît qu'en bas de page ;
  //    « Retour en haut » seulement quand on remonte. (Les règles CSS associées ne s'appliquent que sous 700 px.)
  var last = window.scrollY;
  function onScroll() {
    var y = window.scrollY;
    var bottom = document.documentElement.scrollHeight - window.innerHeight;
    root.classList.toggle("fabs-rest", y < bottom - 420);
    if (Math.abs(y - last) > 6) { root.classList.toggle("fabs-down", y > last); last = y; }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}());
