"use strict";

// Lot A (D1, K5) : éléments communs à toutes les pages Boutique. Le site est statique : chaque page reprend ces
// fragments à l'identique (vérifié par tests/shop-layout.test.js) ; les futurs rayons et fiches les réutiliseront.

const SHOP_FOOTER = '<footer class="site-footer"><strong>Élevage de la Dynastie d’Orkhan</strong><p>52 rue de Masny, 59234 Monchecourt · SIRET : 421 173 824 00028</p><p><a href="tel:+33327990364">03 27 99 03 64</a> · <a href="mailto:contact@dynastiedorkhan.com">contact@dynastiedorkhan.com</a></p><p><a href="https://www.dynastiedorkhan.com/">www.dynastiedorkhan.com</a></p><p><a href="/">Retour à la boutique</a></p><p><a href="/conditions-generales-de-vente/">Conditions générales de vente</a> · <a href="/confidentialite/">Politique de confidentialité</a> · <a href="/mentions-legales/">Mentions légales</a> · <a href="/renoncer-au-contrat/">Renoncer au contrat ici</a></p></footer>';

// Bouton Facebook partagé (VIS-001) ; absent du panier pendant la commande (K5).
const FACEBOOK_FAB = '<a class="facebook-fab" href="https://www.facebook.com/dynastiedorkhan" target="_blank" rel="noopener noreferrer" aria-label="Suivre l’Élevage de la Dynastie d’Orkhan sur Facebook"><svg viewBox="0 0 320 512" aria-hidden="true" focusable="false"><path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06H297V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/></svg></a>';

const BACK_TO_TOP = '<button id="to-top" type="button" aria-label="Remonter en haut de la page" title="Remonter en haut">↑</button><script src="/assets/back-to-top.js" defer></script>';

// Phase 6 : les six rayons validés, dans l'ordre de la feuille de route. La clé est celle du référentiel du Manager
// (CATALOG_SHELVES) ; le slug donne l'URL stable /rayons/<slug>/.
const RAYONS = Object.freeze([
  { key: "ALIMENTATION", slug: "alimentation", label: "Alimentation", subcategories: { croquettes: "Croquettes", patees: "Pâtées", friandises: "Friandises", complements: "Compléments" } },
  { key: "SELLERIE", slug: "sellerie", label: "Sellerie", subcategories: { colliers: "Colliers", laisses: "Laisses", harnais: "Harnais" } },
  { key: "IDENTIFICATION", slug: "identification", label: "Identification", subcategories: { "medailles-animoco": "Médailles Animoco connectées", "medailles-red-dingo": "Médailles Red Dingo gravées" } },
  { key: "JOUETS", slug: "jouets", label: "Jouets", subcategories: { peluches: "Peluches", "jouets-a-macher": "Jouets à mâcher", "jouets-d-occupation": "Jouets d’occupation" } },
  { key: "ACCESSOIRES", slug: "accessoires", label: "Accessoires", subcategories: { gamelles: "Gamelles", couchages: "Couchages", transport: "Transport" } },
  { key: "HYGIENE_SOINS", slug: "hygiene-et-soins", label: "Hygiène et soins", subcategories: { shampooings: "Shampooings", entretien: "Entretien", soins: "Soins" } }
].map(Object.freeze));

// Phase 6 (NAV-02 à NAV-04) : en-tête commun « Accueil | Rayons | Panier | Contact », sans lien Rendez-vous. Le menu
// Rayons est un <details> : il s'ouvre au clic, au clavier et au toucher, sans dépendre du survol ni de JavaScript.
// Le panier reste visible sur mobile. Identique sur toutes les pages Boutique (vérifié par tests/shop-layout.test.js).
const SHOP_HEADER = '<header class="shop-header"><a class="shop-brand" href="/"><img src="/medailles-gravees/assets/logo-dynastie-orkhan.png" alt="" width="76" height="76"><span>Élevage de la Dynastie d’Orkhan<small>La boutique</small></span></a>'
  + '<nav class="shop-menu" aria-label="Navigation de la boutique"><a href="/">Accueil</a>'
  + `<details class="shop-rayons"><summary>Rayons</summary><ul>${RAYONS.map((rayon) => `<li><a href="/rayons/${rayon.slug}/">${rayon.label}</a></li>`).join("")}<li class="shop-rayons-extra"><a href="/sur-demande/">Sur demande</a></li></ul></details>`
  + '<a class="cart-nav-link" href="/panier/">Panier <span class="cart-badge" data-cart-count hidden>0</span></a><a href="https://www.dynastiedorkhan.com/contact/">Contact</a></nav>'
  + '<script src="/assets/shop-menu.js" defer></script></header>';

module.exports = { SHOP_FOOTER, FACEBOOK_FAB, BACK_TO_TOP, RAYONS, SHOP_HEADER };
