// Redirection canonique www → apex (301), chemin et query-string préservés.
//
// POURQUOI AU NIVEAU APPLICATIF. Cette redirection existait comme Redirect Rule
// Cloudflare. Constat du 2026-11-24 : les enregistrements DNS de labonnealerte.fr
// sont en mode DNS-only (nuage gris) — l'apex pointe directement sur Railway et www
// est un CNAME vers *.up.railway.app. Cloudflare ne voit donc plus passer le trafic
// et AUCUNE de ses règles ne s'applique : www servait le site en 200 au lieu de
// rediriger. Conséquence concrète : un cookie de session posé sur www ne vaut pas
// sur l'apex, et un lien de connexion magique « ?token= » ouvert sur www connectait
// l'utilisateur sur un hôte différent de celui qu'il utilise ensuite.
//
// Ici la redirection ne dépend plus de l'infrastructure : elle tient que Cloudflare
// soit en proxy ou non. Si la règle Cloudflare est rétablie, elle répondra avant
// l'app et ce middleware deviendra simplement inerte.
//
// Garde-fous : on ne redirige QUE le sous-domaine www de l'hôte canonique. Les accès
// via *.up.railway.app, localhost ou tout autre hôte passent inchangés, ce qui évite
// toute boucle si le domaine change.

/**
 * Fabrique le middleware de redirection www → apex.
 * @param {string} canonicalHost hôte canonique sans www (ex. 'labonnealerte.fr').
 *   Chaîne vide / absente → null (redirection désactivée).
 * @returns {Function|null} middleware express, ou null si désactivé.
 */
function createCanonicalHostRedirect(canonicalHost) {
  const apex = String(canonicalHost || '').trim().toLowerCase();
  if (!apex) return null;
  const wwwHost = 'www.' + apex;

  return function canonicalHostRedirect(req, res, next) {
    // req.headers.host inclut le port éventuel : on le retire avant comparaison.
    const host = String((req.headers && req.headers.host) || '').toLowerCase().split(':')[0];
    if (host !== wwwHost) return next();
    // originalUrl porte déjà le chemin ET la query-string : rien à reconstruire,
    // donc rien à perdre (indispensable pour les liens « ?token= »).
    return res.redirect(301, 'https://' + apex + req.originalUrl);
  };
}

/**
 * Hôte canonique effectif, lu dans l'environnement.
 * CANONICAL_HOST non définie → 'labonnealerte.fr'. CANONICAL_HOST='' → désactive.
 * @returns {string}
 */
function canonicalHostFromEnv() {
  return process.env.CANONICAL_HOST === undefined
    ? 'labonnealerte.fr'
    : String(process.env.CANONICAL_HOST).trim();
}

module.exports = { createCanonicalHostRedirect, canonicalHostFromEnv };
