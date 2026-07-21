// Lib PARTAGÉE : résolution nom de commune → code INSEE (prérequis de la vague « ville »).
//
// Le profil stocke la ville en NOM simple (ex. « Gap »), jamais en INSEE. Les sources
// communales (eau-potable-commune, catnat-commune) ont besoin du CODE INSEE. Cette lib
// convertit nom + département → INSEE unique, via l'API publique officielle geo.api.gouv.fr
// (déjà utilisée par GET /api/communes). Le département (dispo au profil) sert à lever les
// homonymes (il y a p.ex. plusieurs « Saint-Martin »).
//
// APPELÉE UNE FOIS À LA SOUSCRIPTION (pas à chaque poll) : le code INSEE résolu devient la
// valeur canonique stockée dans les params de l'abonnement ; le nom reste l'affichage.
// La correspondance nom→INSEE ne change jamais → cache mémoire PERMANENT (pas de TTL).
//
// Rappel INSEE→nom : cache secondaire alimenté à la résolution ET par les sources (qui
// reçoivent le libellé de commune dans leurs réponses API) → sert à afficher un libellé
// lisible plutôt que le code brut (resolveLabel côté params.js).

const { safeFetchJson } = require('../../safe-fetch');

const INSEE_RE = /^(?:[0-9]{2}|2[AB])[0-9]{3}$/i;
function isInsee(s) { return INSEE_RE.test(String(s == null ? '' : s).trim()); }

// Normalisation pour comparer des noms de communes (accents, casse, tirets/espaces, « st »).
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/^st(e)?[ -]/, 'saint$1-') // « St-Martin » ~ « Saint-Martin »
    .replace(/[\s'’-]+/g, '-');
}

const GEO_URL = 'https://geo.api.gouv.fr/communes';
const resolveCache = new Map(); // `${normNom}|${dep}` → { insee, nom } | null
const nameByInsee = new Map();  // INSEE → nom lisible

function rememberName(insee, nom) {
  const code = String(insee || '').trim().toUpperCase();
  if (isInsee(code) && nom) nameByInsee.set(code, String(nom).trim());
}
function nameForInsee(insee) {
  return nameByInsee.get(String(insee || '').trim().toUpperCase()) || null;
}

/**
 * Résout un nom de commune (+ département optionnel) en code INSEE unique.
 * @returns {Promise<{ insee:string, nom:string|null, ambiguous:boolean } | null>}
 *   null si aucune commune trouvée. `ambiguous` = true si le choix reste incertain
 *   après filtrage (plusieurs communes homonymes exactes → on prend la plus peuplée).
 */
async function resolveCommuneInsee(nomVille, departement) {
  const raw = String(nomVille == null ? '' : nomVille).trim();
  if (!raw) return null;
  // Déjà un code INSEE saisi (utilisateur avancé, ou valeur déjà canonique) → pass-through.
  if (isInsee(raw)) return { insee: raw.toUpperCase(), nom: nameForInsee(raw), ambiguous: false };

  const dep = String(departement == null ? '' : departement).trim();
  const cacheKey = norm(raw) + '|' + dep;
  if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey);

  let list = [];
  try {
    const url = GEO_URL + '?nom=' + encodeURIComponent(raw)
      + (dep ? '&codeDepartement=' + encodeURIComponent(dep) : '')
      + '&fields=nom,code,codeDepartement,population&boost=population&limit=15';
    const data = await safeFetchJson(url, { maxBytes: 512 * 1024, timeoutMs: 6000 });
    list = Array.isArray(data) ? data : [];
  } catch (err) {
    return null; // réseau/SSRF → on ne résout pas (l'appelant refuse la souscription proprement)
  }
  if (!list.length) { resolveCache.set(cacheKey, null); return null; }

  // Priorité aux correspondances de NOM EXACT (normalisé) ; sinon on garde tout (fuzzy).
  const wanted = norm(raw);
  const exact = list.filter((c) => norm(c.nom) === wanted);
  const pool = exact.length ? exact : list;
  // geo.api trie déjà par population (boost=population) → le 1er est le plus peuplé.
  const best = pool[0];
  const result = {
    insee: String(best.code).toUpperCase(),
    nom: best.nom || null,
    ambiguous: pool.length > 1,
  };
  rememberName(result.insee, result.nom);
  resolveCache.set(cacheKey, result);
  return result;
}

module.exports = { resolveCommuneInsee, isInsee, rememberName, nameForInsee };
