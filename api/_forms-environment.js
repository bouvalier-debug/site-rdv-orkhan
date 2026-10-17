// Formulaires RDV et médaille : ils écrivent dans Orkhan Manager (Production).
// Seul le déploiement Production de la Boutique peut les transmettre. Toute autre exécution (Preview Vercel,
// développement local, environnement inconnu) refuse la requête côté serveur, avant toute lecture ou tout envoi.
// L'environnement vient uniquement de VERCEL_ENV, fixé par Vercel sur le serveur : jamais d'une donnée du navigateur.

const FORMS_DISABLED_OUTSIDE_PRODUCTION = "forms_disabled_outside_production";

function formsForwardingAllowed(env = process.env) {
  return env.VERCEL_ENV === "production";
}

module.exports = { FORMS_DISABLED_OUTSIDE_PRODUCTION, formsForwardingAllowed };
