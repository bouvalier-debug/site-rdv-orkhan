"use strict";

// Lot A (D1, K5) : éléments communs à toutes les pages Boutique. Le site est statique : chaque page reprend ces
// fragments à l'identique (vérifié par tests/shop-layout.test.js) ; les futurs rayons et fiches les réutiliseront.

const SHOP_FOOTER = '<footer class="site-footer"><strong>Élevage de la Dynastie d’Orkhan</strong><p>52 rue de Masny, 59234 Monchecourt · SIRET : 421 173 824 00028</p><p><a href="tel:+33327990364">03 27 99 03 64</a> · <a href="mailto:contact@dynastiedorkhan.com">contact@dynastiedorkhan.com</a></p><p><a href="https://www.dynastiedorkhan.com/">www.dynastiedorkhan.com</a></p><p><a href="/">Retour à la boutique</a></p><p><a href="/conditions-generales-de-vente/">Conditions générales de vente</a> · <a href="/confidentialite/">Politique de confidentialité</a> · <a href="/mentions-legales/">Mentions légales</a> · <a href="/renoncer-au-contrat/">Renoncer au contrat ici</a></p></footer>';

// Bouton Facebook partagé (VIS-001) ; absent du panier pendant la commande (K5).
const FACEBOOK_FAB = '<a class="facebook-fab" href="https://www.facebook.com/dynastiedorkhan" target="_blank" rel="noopener noreferrer" aria-label="Suivre l’Élevage de la Dynastie d’Orkhan sur Facebook"><svg viewBox="0 0 320 512" aria-hidden="true" focusable="false"><path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06H297V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/></svg></a>';

const BACK_TO_TOP = '<button id="to-top" type="button" aria-label="Remonter en haut de la page" title="Remonter en haut">↑</button><script src="/assets/back-to-top.js" defer></script>';

module.exports = { SHOP_FOOTER, FACEBOOK_FAB, BACK_TO_TOP };
