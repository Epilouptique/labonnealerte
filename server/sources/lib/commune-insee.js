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

// ─── Variante COORDONNÉES (vague ISS) ────────────────────────────────────────
// Sœur de resolveCommuneInsee : résout un nom de commune (+ département optionnel pour lever
// les homonymes) en { nom, lat, lon }, via le champ `centre` (GeoJSON Point) de geo.api.gouv.fr.
// Appelée UNE FOIS À LA SOUSCRIPTION ; la valeur canonique stockée dans les params est ENCODÉE
// (encodeCoords) — le poll n'appelle jamais l'API de géocodage.

const coordsCache = new Map(); // `${normNom}|${dep}` → { nom, lat, lon } | null

/**
 * @returns {Promise<{ nom:string, lat:number, lon:number, ambiguous:boolean } | null>}
 */
async function resolveCommuneCoords(nomVille, departement) {
  const raw = String(nomVille == null ? '' : nomVille).trim();
  if (!raw) return null;

  const dep = String(departement == null ? '' : departement).trim();
  const cacheKey = norm(raw) + '|' + dep;
  if (coordsCache.has(cacheKey)) return coordsCache.get(cacheKey);

  let list = [];
  try {
    // Portée NATIONALE : contrairement à resolveCommuneInsee (type 'commune', local),
    // le type 'commune-coords' vise un point n'importe où en France (l'ISS survole tout).
    // On n'envoie donc PAS codeDepartement en filtre (il exclurait Paris/Clamensane depuis
    // un profil 05) ; le département sert seulement de DÉPARTAGE entre homonymes (ci-dessous),
    // d'où sa présence dans `fields`.
    const url = GEO_URL + '?nom=' + encodeURIComponent(raw)
      + '&fields=nom,code,codeDepartement,centre,population&boost=population&limit=15';
    const data = await safeFetchJson(url, { maxBytes: 512 * 1024, timeoutMs: 6000 });
    list = Array.isArray(data) ? data : [];
  } catch (err) {
    return null; // réseau/SSRF → non résolu (l'appelant refuse la souscription proprement)
  }
  if (!list.length) { coordsCache.set(cacheKey, null); return null; }

  const wanted = norm(raw);
  const exact = list.filter((c) => norm(c.nom) === wanted);
  const pool = exact.length ? exact : list;
  // Ne garde que les entrées portant un centre exploitable (Point [lon, lat]).
  const withCentre = pool.filter((c) => c && c.centre && Array.isArray(c.centre.coordinates)
    && c.centre.coordinates.length === 2);
  if (!withCentre.length) { coordsCache.set(cacheKey, null); return null; }

  // Départage : à nom égal, on PRIORISE la commune du département du profil (lève les
  // homonymes localement), sinon on garde l'ordre geo.api (tri par population).
  const localMatch = dep ? withCentre.find((c) => String(c.codeDepartement) === dep) : null;
  const best = localMatch || withCentre[0];
  const lon = Number(best.centre.coordinates[0]);
  const lat = Number(best.centre.coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { coordsCache.set(cacheKey, null); return null; }

  const result = { nom: best.nom || raw, lat, lon, ambiguous: withCentre.length > 1 };
  if (best.code) rememberName(best.code, result.nom);
  coordsCache.set(cacheKey, result);
  return result;
}

// ─── Encodage canonique des coordonnées dans UN champ (modèle v2 « une valeur par clé ») ──
// Format : "lat|lon|nom" (4 décimales ~11 m, largement suffisant pour l'ISS). Le « | » ne peut
// apparaître ni dans un nombre ni dans un nom de commune → séparateur sûr.
function encodeCoords(c) {
  if (!c || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lon))) return null;
  const nom = String(c.nom || '').replace(/\|/g, ' ').trim();
  if (!nom) return null;
  return `${Number(c.lat).toFixed(4)}|${Number(c.lon).toFixed(4)}|${nom}`;
}

// "48.8566|2.3522|Paris" → { lat, lon, nom } | null. Valide bornes lat/lon.
function decodeCoords(str) {
  const parts = String(str == null ? '' : str).split('|');
  if (parts.length < 3) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  const nom = parts.slice(2).join('|').trim();
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (!nom) return null;
  return { lat, lon, nom };
}

function isEncodedCoords(str) { return decodeCoords(str) != null; }

module.exports = {
  resolveCommuneInsee, isInsee, rememberName, nameForInsee,
  resolveCommuneCoords, encodeCoords, decodeCoords, isEncodedCoords,
};
