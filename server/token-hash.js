// Empreinte des jetons stockés (chantier sécurité « jetons en empreinte », phase 1).
//
// On ne stocke plus les jetons EN CLAIR en base : on garde une empreinte HMAC-SHA256
// calculée avec un secret serveur (TOKEN_HASH_SECRET), jamais stocké en base. Un dump de
// la base ne contient donc que des empreintes, inutilisables sans le secret.
//
// COUVERTURE PHASE 1 : jetons dont la valeur brute n'est émise QU'UNE FOIS, au moment de
// la génération, puis seulement VÉRIFIÉE en entrée :
//   A) sessions.token           (session ; rendue au client, puis présentée en Bearer)
//   B) subscribers.magic_token  (lien magique ; e-mailé dans la même requête, usage unique)
// NE SONT PAS couverts ici C) subscribers.token et D) user_tasks.confirm_token : leur valeur
// brute est RELUE depuis la base et RÉ-ÉMISE plus tard dans des e-mails (poller /
// user-tasks-notify). Les hacher au repos casserait les liens. Voir la proposition de
// migration vers des jetons signés sans état dans rapports/audit/securite-jetons-empreinte-*.
//
// FORMAT VERSIONNÉ : l'empreinte stockée est « h1: » + HMAC-hex. Le préfixe (a) distingue
// une ligne convertie d'un jeton brut legacy (même longueur hex, sinon indistinguables),
// (b) prépare une future bi-clé « h2: » sans migration destructrice. Cette valeur préfixée
// NE VOYAGE JAMAIS : le client et les liens portent toujours le brut (64 hex) ; le
// BEARER_RE d'auth-transport.js n'a donc pas à connaître « : ».
//
// ÉCHEC BRUYANT si le secret manque, exactement comme IP_HASH_SALT (server/ugc.js) : mieux
// vaut refuser de démarrer qu'émettre des empreintes faibles ou incohérentes.

const crypto = require('crypto');

const SECRET = (process.env.TOKEN_HASH_SECRET || '').trim();
if (!SECRET) {
  throw new Error(
    'TOKEN_HASH_SECRET manquant : définissez la variable d\'environnement ' +
    '(clé HMAC des jetons de session) avant de démarrer le serveur.'
  );
}

const PREFIX = 'h1:';
// Forme d'un jeton brut du projet : crypto.randomBytes(32).toString('hex') = 64 hex.
const RAW_RE = /^[0-9a-f]{64}$/i;

// Empreinte stockable d'un jeton brut, ou null si le jeton n'a pas la forme attendue
// (on ne hache alors rien : la valeur passera par le repli « brut » le temps de la transition).
function fingerprint(raw) {
  if (typeof raw !== 'string' || !RAW_RE.test(raw)) return null;
  return PREFIX + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

// Une valeur déjà stockée est-elle une empreinte (vs un jeton brut legacy) ?
function isFingerprint(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

// Les valeurs à chercher en base pour un jeton brut entrant, PENDANT LA TRANSITION :
// l'empreinte d'abord (lignes neuves/converties), puis le brut (lignes pas encore converties).
// S'emploie avec « col = ANY($1::text[]) ». À la fin de la transition (phase 3), on ne
// gardera que l'empreinte.
function lookupCandidates(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  const fp = fingerprint(raw);
  return fp ? [fp, raw] : [raw];
}

module.exports = { fingerprint, isFingerprint, lookupCandidates, PREFIX, RAW_RE };
