const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { inline, pageHtml } = require("../scripts/build-legal-pages");
const { deliveryDelayLines, MODE_LABELS } = require("../assets/cart");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const CGV_2026_10_05_SHA256 = "517caad87254e11c688cb2c62b06f965b4860a1c44b5ea1845197d3725cfe07e";

test("la source CGV canonique conserve la version et l'empreinte validées", () => {
  const bytes = fs.readFileSync(path.join(root, "legal", "cgv-2026-10-05.json"));
  const legal = JSON.parse(bytes.toString("utf8"));
  assert.equal(legal.version, "cgv-2026-10-05");
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), CGV_2026_10_05_SHA256);
  assert.doesNotMatch(bytes.toString("utf8"), /Annexe à l'article R221-1|Rappel sous le formulaire|Le modèle officiel est reproduit/);
});

test("la page CGV générée correspond exactement au fichier commité", () => {
  assert.equal(read("conditions-generales-de-vente/index.html"), pageHtml());
});

test("le formulaire officiel conserve littéralement les sept marqueurs (*)", () => {
  const html = pageHtml();
  assert.equal((html.match(/\(\*\)/g) || []).length, 7);
  assert.equal((html.match(/<em>/g) || []).length, 1);
  assert.match(html, /<em>Référence de commande/);
  const form = html.slice(html.indexOf("Formulaire de rétractation"));
  assert.equal((form.match(/<em>/g) || []).length, 0);
  assert.match(html, /<strong>Formulaire de rétractation<\/strong>/);
  assert.equal(inline("*texte officiel* et **gras**"), "*texte officiel* et <strong>gras</strong>");
});

test("les pages Boutique exposent les quatre liens permanents", () => {
  for (const file of [
    "index.html", "medailles-connectees/index.html", "cosmetiques/index.html", "panier/index.html",
    "panier/confirmation/index.html", "conditions-generales-de-vente/index.html",
    "confidentialite/index.html", "mentions-legales/index.html", "renoncer-au-contrat/index.html"
  ]) {
    const html = read(file);
    assert.match(html, /href="\/conditions-generales-de-vente\/"/);
    assert.match(html, /href="\/confidentialite\/"/);
    assert.match(html, /href="\/mentions-legales\/"/);
    assert.match(html, /href="\/renoncer-au-contrat\/"/);
  }
});

test("les anciennes URLs juridiques sont redirigées définitivement sans hôte codé en dur", () => {
  const config = JSON.parse(read("vercel.json"));
  const expected = new Map([
    ["/medailles-gravees/conditions-vente.html", "/conditions-generales-de-vente/"],
    ["/medailles-gravees/confidentialite.html", "/confidentialite/"],
    ["/medailles-gravees/mentions-legales.html", "/mentions-legales/"]
  ]);
  for (const [source, destination] of expected) {
    const redirect = config.redirects.find((entry) => entry.source === source);
    assert.deepEqual(redirect, { source, destination, permanent: true });
  }
});

test("les libellés et délais de livraison restent stables", () => {
  assert.equal(MODE_LABELS.pickup, "Retrait à l’élevage (gratuit)");
  assert.equal(MODE_LABELS["animoco-light-be"], "Belgique — Mondial Relay, Point Relais ou Locker choisi par email après la commande");
  assert.deepEqual(deliveryDelayLines({ hasRedDingo: true, hasOther: true, mode: "pickup" }), [
    "Médailles gravées : transmission à Red Dingo sous 24 h ouvrées, fabrication sous 7 à 10 jours ouvrés (indicatif), puis retrait à l’élevage sur rendez-vous dès réception.",
    "Disponible à l’élevage sous 24 h ouvrées, sur rendez-vous. Vous êtes prévenu par email."
  ]);
  assert.deepEqual(deliveryDelayLines({ hasRedDingo: true, hasOther: true, mode: "animoco-light-fr" }), [
    "Médailles gravées : transmission à Red Dingo sous 24 h ouvrées, puis fabrication et expédition par Red Dingo sous 7 à 10 jours ouvrés (indicatif). Livraison comprise.",
    "Préparation et expédition sous 48 h ouvrées, puis La Poste Lettre verte suivie : 3 à 5 jours ouvrés (indicatif).",
    "Les médailles Red Dingo sont expédiées séparément, directement par Red Dingo."
  ]);
  assert.equal(deliveryDelayLines({ hasRedDingo: false, hasOther: true, mode: "animoco-light-be" })[0], "Pour une livraison en Belgique, le Point Relais ou Locker Mondial Relay est choisi avec le client par email après la commande. Préparation et expédition sous 48 h ouvrées après votre choix, puis Mondial Relay : 3 à 6 jours ouvrés (indicatif).");
});

test("les blocs juridiques produits reprennent les arbitrages validés", () => {
  assert.match(read("index.html"), /Produit personnalisé — pas de droit de rétractation/);
  assert.match(read("medailles-connectees/index.html"), /droit de rétractation de 14 jours/i);
  assert.match(read("cosmetiques/index.html"), /produit descellé.*raisons d’hygiène ou de protection de la santé/i);
});

test("toutes les phrases et routes de l'ancien circuit ont disparu des pages Boutique", () => {
  const pages = ["index.html", "medailles-connectees/index.html", "cosmetiques/index.html", "panier/index.html", "panier/confirmation/index.html", "conditions-generales-de-vente/index.html", "confidentialite/index.html", "mentions-legales/index.html"];
  const obsolete = ["Envoyer ma demande de vérification", "Envoyer ma demande de commande", "Envoyer ma demande", "Afficher l'ancien formulaire de demande", "Merci de ne pas effectuer de règlement", "règlement est demandé uniquement après", "Frais réduits confirmés avant règlement", "Autre pays — nous contacter", "Choix Mondial Relay à venir", "pourront bientôt ajouter", "Payer par carte", "/api/medaille-webhook", "/medailles-gravees/conditions-vente.html"];
  const html = pages.map(read).join("\n");
  for (const phrase of obsolete) assert.equal(html.includes(phrase), false, phrase);
});

test("tous les scripts intégrés aux pages produits sont syntaxiquement valides", () => {
  for (const file of ["index.html", "medailles-connectees/index.html", "cosmetiques/index.html"]) {
    const scripts = [...read(file).matchAll(/<script(?![^>]*src=|[^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)];
    for (const [, source] of scripts) assert.doesNotThrow(() => new Function(source), file);
  }
});
