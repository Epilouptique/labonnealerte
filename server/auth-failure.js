// Détection et signalement des ÉCHECS D'AUTHENTIFICATION des fournisseurs OAuth2
// (France Travail, PISTE/Légifrance, RTE, Twitch). Module partagé par les quatre
// modules *-auth.js du projet.
//
// POURQUOI. France Travail renouvelle automatiquement, chaque année à partir d'octobre
// 2026, le Client ID et le Client Secret de chaque application (mails de rappel avant
// renouvellement puis avant expiration des anciens identifiants). Les autres portails
// pratiquent des rotations comparables. Le jour où un identifiant expire, le flux
// client_credentials répond `invalid_client` / 401 / 403 — et, AVANT ce module, les
// sources concernées se contentaient de journaliser un `console.warn` et de renvoyer
// « inactive » : vu du site, la source passait en « rien à signaler », exactement comme
// un jour sans actualité. Une rotation d'identifiants pouvait donc casser une source
// EN SILENCE, pendant des semaines.
//
// CE QUE FAIT CE MODULE. Il marque l'erreur (`err.authFailure = true`) pour que la
// source puisse la PROPAGER au lieu de la ravaler : le poller enregistre alors un
// événement 'failed' (cf. logFailedDedup), c'est-à-dire « Incident de surveillance »
// sur la page statut et dans le tableau de veille, et il LAISSE l'état précédent en
// place (pas de fausse désactivation). AUCUN mail n'est envoyé aux abonnés : un
// événement 'failed' ne notifie jamais (seul 'activated' notifie) — principe « que du
// signal », l'incident regarde Hugo, pas les abonnés.
//
// SECRETS. Rien de ce qui est journalisé ici ne contient de valeur d'identifiant : on
// n'imprime que le NOM des variables d'environnement à vérifier, le statut HTTP et, s'il
// est présent, le CODE d'erreur normalisé du fournisseur (`invalid_client`…), filtré par
// une expression stricte — jamais `error_description`, qui peut contenir l'identifiant.

// Codes d'erreur OAuth2 acceptés en journal : minuscules/underscore uniquement, bornés.
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,38}$/;

/**
 * Extrait le code d'erreur OAuth2 d'un corps de réponse, SANS jamais retourner de texte
 * libre (ni description, ni écho d'identifiant). Renvoie null si rien d'exploitable.
 * @param {string} rawBody corps brut de la réponse du fournisseur
 * @returns {string|null}
 */
function safeErrorCode(rawBody) {
  if (!rawBody) return null;
  let code = null;
  try {
    const json = JSON.parse(rawBody);
    if (json && typeof json.error === 'string') code = json.error.trim();
  } catch (err) {
    // Corps non JSON (certains portails renvoient du texte) : on tente le motif
    // `error=xxx` et rien d'autre.
    const m = String(rawBody).match(/\berror["':=\s]+([a-z][a-z0-9_]{0,38})\b/i);
    if (m) code = m[1].toLowerCase();
  }
  return code && SAFE_ERROR_CODE.test(code) ? code : null;
}

/**
 * Marque une erreur comme ÉCHEC D'AUTHENTIFICATION (identifiants rejetés ou absents).
 * Les sources testent `isAuthFailure(err)` pour décider de propager (incident) plutôt
 * que de dégrader en « inactive ».
 */
function markAuthFailure(err, provider) {
  err.authFailure = true;
  err.authProvider = provider;
  return err;
}

/** true si l'erreur vient d'un rejet/absence d'identifiants (et non du réseau). */
function isAuthFailure(err) {
  return !!(err && err.authFailure);
}

/**
 * Journalise EXPLICITEMENT un rejet d'identifiants, en une ligne reconnaissable
 * (`[auth][<provider>] IDENTIFIANTS REJETÉS`) : c'est ce que Hugo cherchera dans les
 * journaux Railway le jour d'une rotation.
 * @param {string} provider      nom lisible du fournisseur (ex. 'france-travail')
 * @param {number} status        statut HTTP de la réponse du endpoint token
 * @param {string|null} code     code d'erreur normalisé (safeErrorCode), ou null
 * @param {string[]} envVarNames NOMS des variables à mettre à jour (jamais les valeurs)
 */
function logAuthRejection(provider, status, code, envVarNames) {
  console.error(
    `[auth][${provider}] IDENTIFIANTS REJETÉS (HTTP ${status}${code ? `, error=${code}` : ''}) ` +
    `— rotation d'identifiants probable. Mettre à jour ${envVarNames.join(' / ')} sur Railway ` +
    `puis redéployer (procédure : docs/rotation-identifiants.md). La ou les sources concernées ` +
    `passent en « incident de surveillance » ; aucun mail n'est envoyé aux abonnés.`
  );
}

/** Variante « identifiants absents de l'environnement » (variable vidée ou jamais posée). */
function logAuthMissing(provider, envVarNames) {
  console.error(
    `[auth][${provider}] IDENTIFIANTS ABSENTS (${envVarNames.join(' / ')} non définis) ` +
    `— voir docs/rotation-identifiants.md.`
  );
}

module.exports = { safeErrorCode, markAuthFailure, isAuthFailure, logAuthRejection, logAuthMissing };
