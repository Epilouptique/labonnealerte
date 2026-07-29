// Source PARAMÉTRÉE (OpenAlert v2) : Météo des forêts (risque feux de forêt,
// Météo-France), DÉPARTEMENT au choix. Actif si danger TRÈS ÉLEVÉ (niveau 4)
// UNIQUEMENT (anti-spam). Publiée juin→septembre, silencieuse hors saison.
//
// ── SOURCE : fichier public Météo-France, SANS CLÉ ───────────────────────────
//   https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF/mdf_<annee>.csv.gz
// Référencé par le jeu data.gouv.fr « Archives de la Météo des forêts »
// (producteur Météo-France, licence lov2 → réutilisation libre avec attribution).
// Malgré le nom « Archives », le fichier est VIVANT : mis à jour chaque jour vers
// 14:50 UTC, la dernière ligne porte le bulletin du jour.
//
// Un SEUL fichier couvre les 96 départements → un seul appel réseau par cycle,
// quel que soit le nombre d'abonnés (même esprit que lib/vigilance-factory.js).
//
// ⚠️ REMPLACE une version « prête-à-brancher » qui devinait un endpoint
// public-api.meteofrance.fr/DPMeteoForets, devinait le nom du champ de niveau
// (fonction maxDanger() qui scannait le JSON à l'aveugle) et exigeait une clé
// METEOFRANCE_FORETS_API_KEY jamais souscrite. Plus aucune clé n'est nécessaire.
//
// ── LE FORMAT DU CSV CHANGE D'UNE ANNÉE SUR L'AUTRE (constaté, pas supposé) ──
// Comparaison des trois millésimes publiés :
//   2024 : séparateur VIRGULE   · codes « 1 », « 2 »…   · colonne « nom_dep »
//   2025 : séparateur VIRGULE   · codes « 1 », « 2 »…   · colonne « dep_nom »
//   2026 : séparateur POINT-VIRGULE · codes « 01 », « 02 »… · colonne « nom_dep »
// Trois variations en trois ans. On ne code donc EN DUR ni le séparateur, ni
// l'ordre des colonnes, ni le remplissage des codes :
//   • séparateur détecté sur la ligne d'en-tête ;
//   • colonnes indexées PAR NOM ;
//   • codes départements normalisés (« 1 » → « 01 », « 2a » → « 2A »).
// Si les colonnes attendues disparaissent, on dégrade en inactive avec un log
// explicite — jamais de lecture positionnelle hasardeuse.
//
// ── SEUIL (calibré sur 63 bulletins réels, 28/05→29/07/2026) ────────────────
//   niveau 1 : 38,2 %  ·  2 : 40,9 %  ·  3 : 19,6 %  ·  4 : 1,3 %
// Le seuil 4 est le bon calibrage anti-spam : le département le plus exposé
// connaîtrait ~4 épisodes sur une saison.
//
// ── ENUM : 96 DÉPARTEMENTS, DOM EXCLUS ──────────────────────────────────────
// L'ancien enum se limitait à 15 départements du Sud. Les données de la saison
// 2026 le démentent : 5 départements ont connu un niveau 4 hors de cet enum
// (Haute-Garonne, Deux-Sèvres, Meurthe-et-Moselle, Moselle, Essonne) tandis que
// 7 des 15 retenus n'en ont connu aucun. Le 29/07/2026, les DEUX seuls
// départements en niveau 4 étaient la Meurthe-et-Moselle et la Moselle.
// ⚠️ Les DOM (971-976) sont EXCLUS : la source ne les couvre pas (96 codes, tous
// métropole + Corse — vérifié par diff exact contre geo.js). Les inclure créerait
// des abonnements muets à vie, sans erreur ni message.

const zlib = require('zlib');
const { safeFetchBuffer } = require('../safe-fetch');
const { DEPARTEMENTS } = require('../geo');

const BASE = 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF';
const PUBLIC_URL = 'https://meteofrance.com/meteo-des-forets';
const TIMEOUT_MS = 15_000;
// Saison complète = 120 jours × 96 départements ≈ 450 Ko décompressés (constaté
// sur 2024 et 2025). Marge large : le gz fait ~25-50 Ko, le coût réel est faible.
const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h : publication quotidienne à 14:50 UTC
const ERROR_TTL_MS = 10 * 60 * 1000;     // 10 min : réessai rapproché en cas d'échec
const SEUIL = 4;                          // 4 = très élevé (rouge)
// Au-delà, le dernier bulletin est considéré comme périmé (hors saison) : on ne
// veut PAS servir un bulletin de septembre au mois de décembre.
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

// « 1 » → « 01 », « 2a » → « 2A », « 06 » → « 06 ».
function normDept(code) {
  const s = String(code == null ? '' : code).trim().toUpperCase();
  return /^\d$/.test(s) ? `0${s}` : s;
}

// 96 départements : métropole + Corse. DOM exclus (non couverts par la source).
const DEPTS = DEPARTEMENTS
  .filter((d) => !/^97/.test(d.code))
  .map((d) => ({ value: normDept(d.code), label: d.name }));
const NAME = {};
DEPTS.forEach((d) => { NAME[d.value] = d.label; });

const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPTS,
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Cache mutualisé : { at, ttl, byDept: Map(dept → { niveau, bulletin }) | null }.
let cache = null;

// CSV → Map(département normalisé → { niveau, bulletin }) pour le bulletin le
// PLUS RÉCENT. Retourne null si le fichier n'a pas la forme attendue.
function parseMdf(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return null;

  // Séparateur détecté, jamais supposé (il a changé entre 2025 et 2026).
  const header = lines[0];
  const sep = (header.split(';').length > header.split(',').length) ? ';' : ',';
  const cols = header.split(sep).map((c) => c.trim().toLowerCase());
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });

  // Colonnes indexées par NOM. « nom_dep » (2024, 2026) ou « dep_nom » (2025) :
  // le libellé n'est pas utilisé (on a le nôtre via geo.js), donc non requis.
  if (idx.date == null || idx.num_dep == null || idx.niveau_j1 == null) return null;

  let latest = null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(sep);
    const stamp = (f[idx.date] || '').trim();
    const dep = normDept(f[idx.num_dep]);
    const niveau = parseInt(f[idx.niveau_j1], 10);
    if (!stamp || !dep || !Number.isFinite(niveau)) continue;
    const t = Date.parse(stamp);
    if (Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
    rows.push({ t, dep, niveau });
  }
  if (latest === null) return null;

  // On ne garde que le bulletin le plus récent (on ne se fie pas à l'ordre des
  // lignes). niveau_j1 = LENDEMAIN du bulletin (le bulletin est élaboré ~17h
  // locales pour le lendemain et le surlendemain).
  const byDept = new Map();
  for (const r of rows) if (r.t === latest) byDept.set(r.dep, r.niveau);
  return { byDept, bulletin: new Date(latest) };
}

// Télécharge et parse le fichier de l'année courante ; repli sur l'année
// précédente si elle n'existe pas encore (constaté : mdf_2027 → 404 en juillet
// 2026). Le garde-fou de fraîcheur ci-dessous empêche d'exploiter un fichier
// périmé récupéré par ce repli.
async function fetchMdf() {
  const year = new Date().getFullYear();
  for (const y of [year, year - 1]) {
    let buf;
    try {
      buf = await safeFetchBuffer(`${BASE}/mdf_${y}.csv.gz`, {
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_BYTES,
        accept: 'application/gzip, application/octet-stream, */*',
      });
    } catch (err) {
      continue; // 404 (année non commencée) ou réseau → on tente l'année d'avant
    }
    let text;
    try { text = zlib.gunzipSync(buf).toString('utf8'); }
    catch (err) { console.warn(`[meteo-forets] mdf_${y} : décompression impossible.`); continue; }

    const parsed = parseMdf(text);
    if (!parsed) {
      console.warn(`[meteo-forets] mdf_${y} : colonnes attendues introuvables — format Météo-France modifié ?`);
      continue;
    }
    return parsed;
  }
  return null;
}

// Retourne { byDept, bulletin } ou null.
async function load() {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;

  const parsed = await fetchMdf();
  if (!parsed) {
    cache = { at: now, ttl: ERROR_TTL_MS, data: null };
    return null;
  }
  // Hors saison : le dernier bulletin date de la fin septembre précédente.
  // On ne le rejoue pas — silence, comme prévu par le dispositif.
  if (now - parsed.bulletin.getTime() > STALE_MS) {
    cache = { at: now, ttl: CACHE_TTL_MS, data: null };
    return null;
  }
  cache = { at: now, ttl: CACHE_TTL_MS, data: parsed };
  return cache.data;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  let data;
  try { data = await load(); }
  catch (err) {
    // Filet : load() avale déjà ses erreurs, mais on ne laisse jamais remonter.
    console.warn(`[meteo-forets] chargement impossible (${err.message}) → inactive.`);
    data = null;
  }
  if (!data) return combos.map(inactive);
  const { byDept, bulletin } = data;

  return combos.map((params) => {
    const dep = normDept((params && params.departement) || '');
    if (!NAME[dep]) return inactive(params);
    const niveau = byDept.get(dep);
    if (!Number.isFinite(niveau) || niveau < SEUIL) return inactive(params);
    return {
      params,
      state: 'active',
      // « depuis » = horodatage du BULLETIN officiel, pas l'heure à laquelle notre
      // serveur l'a lu (qui dépend du TTL de cache et varierait sans raison). On
      // date la donnée, jamais notre traitement.
      since: new Date(bulletin),
      until: null,
      // Département EN TÊTE, sans article : « dans le ${nom} » était correct pour
      // les 15 départements du Sud de l'ancien enum, mais faux dès qu'on ouvre aux
      // 96 (« dans le Moselle », « dans le Meurthe-et-Moselle »). Les articles des
      // départements français sont trop irréguliers pour une règle (« en Moselle »,
      // « dans l'Aisne », « dans les Bouches-du-Rhône », « à Paris ») : on supprime
      // le problème au lieu de coder 96 exceptions.
      message: `🔥 ${NAME[dep]} : danger feux de forêt TRÈS ÉLEVÉ — évitez tout feu, prudence absolue`,
      url: PUBLIC_URL,
    };
  });
}

// _parseMdf exposé pour les tests (convention lib/panneaupocket-veille.js et son
// _buildMessage) : c'est la pièce sensible, le format du CSV ayant changé chaque année.
module.exports = { id: 'meteo-forets', paramsSchema, checkWithParams, _parseMdf: parseMdf };
