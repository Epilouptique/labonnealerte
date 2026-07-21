// Source PARAMÉTRÉE (OpenAlert v2), 2 CHAMPS : veille d'OFFRES D'EMPLOI (France Travail).
// L'abonné choisit des mots-clés + un département ; alerte à la publication d'une NOUVELLE
// offre correspondante — équivalent « alerte leboncoin » pour l'emploi. Première source à
// exploiter l'architecture front multi-champs (string + enum géo pré-remplie).
//
// API officielle « Offres d'emploi v2 » (api.francetravail.io), OAuth2 client_credentials via
// francetravail-auth.js (token mutualisé, renouvelé 5 min avant expiration). Endpoints vérifiés
// vivants le 21/07/2026. Sans identifiants (FRANCETRAVAIL_CLIENT_ID/SECRET) → no-op silencieux.
//   GET .../partenaire/offresdemploi/v2/offres/search?motsCles=<kw>&departement=<code>&sort=1
//     → 200 { resultats:[ {id, intitule, dateActualisation, lieuTravail:{libelle}, entreprise:{nom},
//        typeContratLibelle, origineOffre:{urlOrigine} }, … ] } ; 204 = aucun résultat.
//
// ── CGU France Travail (respectées) ──────────────────────────────────────────
// Rediffusion des offres AUTORISÉE. Obligations honorées ici : mention de la SOURCE
// « France Travail » + DATE de mise à jour de l'offre ; AUCUNE donnée de contact exposée
// (on n'affiche que intitulé / lieu / entreprise / type de contrat, jamais l'objet `contact`).
// Interdit (non fait) : sous-licencier la base, exposer une API dérivée d'extraction.
//
// ── ANTI-RÉTROACTIF & DÉDOUBLONNAGE ──────────────────────────────────────────
// Au 1er passage sur un combo, on MÉMORISE les identifiants d'offres déjà présents SANS
// alerter (offres publiées avant la souscription). Seules les offres dont l'`id` n'a jamais
// été vu déclenchent. Dédoublonnage par `id` stable → une simple ré-actualisation d'offre
// (même id, `dateActualisation` mise à jour) ne re-notifie PAS. Cache mémoire par combo (perte
// au redémarrage = réinit sûre, jamais de fausse alerte rétroactive). TTL 3h.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getToken, isConfigured } = require('../francetravail-auth');
const { DEPARTEMENTS } = require('../geo');

const SEARCH = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h (les offres n'apparaissent pas à la seconde)
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const SEEN_CAP = 500; // borne mémoire des ids déjà vus par combo
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

const paramsSchema = [
  {
    key: 'motcle',
    label: 'Mots-clés',
    type: 'string',
    placeholder: 'développeur web',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Les mots-clés du poste recherché (ex. « aide-soignant », « développeur web »).',
  },
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
];

// Cache par combo : `${motcle}|${dep}` → { seen:Set<id>, at }.
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://candidat.francetravail.fr/offres/recherche' };
}

function comboKey(motcle, dep) { return `${motcle.toLowerCase()}|${dep}`; }

function formatFr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

// Recherche d'offres pour un combo. Renvoie un tableau d'offres (peut être vide). Throw sur erreur.
async function searchOffres(motcle, dep, token) {
  const url = `${SEARCH}?motsCles=${encodeURIComponent(motcle)}&departement=${encodeURIComponent(dep)}&sort=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Range: 'offres 0-49' },
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (res.status === 204) return []; // aucun résultat
  if (res.status !== 200 && res.status !== 206) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  return Array.isArray(body.resultats) ? body.resultats : [];
}

// Champs SÛRS uniquement (jamais d'objet `contact`). Construit le message d'une offre.
function offreLine(o) {
  const titre = String(o.intitule || 'offre').trim();
  const lieu = o.lieuTravail && o.lieuTravail.libelle ? ` — ${String(o.lieuTravail.libelle).trim()}` : '';
  const contrat = o.typeContratLibelle ? ` (${String(o.typeContratLibelle).trim()})` : '';
  return `${titre}${lieu}${contrat}`;
}
function offreUrl(o) {
  return (o.origineOffre && o.origineOffre.urlOrigine)
    || (o.id ? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}` : 'https://candidat.francetravail.fr/offres/recherche');
}

async function checkOne(motcle, dep, token, now) {
  const key = comboKey(motcle, dep);
  const entry = cache.get(key);
  if (entry && now - entry.at < CACHE_TTL_MS) return null; // throttle : rien à refaire (rejoué inactive au flush)

  const offres = await searchOffres(motcle, dep, token);
  const ids = offres.map((o) => String(o && o.id)).filter((x) => x && x !== 'undefined');

  // 1er passage : on mémorise les offres présentes SANS alerter (anti-rétroactif).
  if (!entry) {
    cache.set(key, { seen: new Set(ids), at: now });
    return inactive();
  }

  // Offres dont l'id n'a JAMAIS été vu = nouveautés depuis la souscription.
  const nouvelles = offres.filter((o) => o && o.id && !entry.seen.has(String(o.id)));
  // Mise à jour du « déjà vu » (borné pour la mémoire).
  ids.forEach((id) => entry.seen.add(id));
  if (entry.seen.size > SEEN_CAP) entry.seen = new Set(ids);
  entry.at = now;

  if (!nouvelles.length) return inactive();

  // `sort=1` (date décroissante) → la 1re nouvelle est la plus récente.
  const derniere = nouvelles[0];
  const dep_nom = NAME[dep] || dep;
  const n = nouvelles.length;
  const entete = n > 1 ? `${n} nouvelles offres` : 'Nouvelle offre';
  const maj = derniere.dateActualisation ? ` Mise à jour le ${formatFr(derniere.dateActualisation)}.` : '';
  return {
    state: 'active',
    since: new Date(),
    until: null,
    // Mention obligatoire de la source « France Travail » + date de MAJ. Aucune donnée de contact.
    message: `💼 ${entete} pour « ${motcle} » (${dep_nom}) — ex. : ${offreLine(derniere)}.${maj} Source : France Travail.`,
    url: offreUrl(derniere),
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  // Sans identifiants → no-op silencieux (prête-à-brancher, comme meteo-forets).
  if (!isConfigured()) {
    return combos.map((params) => Object.assign({ params }, inactive()));
  }

  let token;
  try { token = await getToken(); }
  catch (err) {
    console.warn(`[veille-emploi] auth échouée (${err.message}) → inactive.`);
    return combos.map((params) => Object.assign({ params }, inactive()));
  }

  const now = Date.now();
  let fetches = 0;
  const out = [];
  for (const params of combos) {
    const motcle = String((params && params.motcle) || '').trim();
    const dep = String((params && params.departement) || '').trim();
    if (!motcle || !NAME[dep]) { out.push(Object.assign({ params }, inactive())); continue; }

    const key = comboKey(motcle, dep);
    const entry = cache.get(key);
    if (entry && now - entry.at < CACHE_TTL_MS) { out.push(Object.assign({ params }, inactive())); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, inactive())); continue; }
    fetches += 1;

    try {
      const r = await checkOne(motcle, dep, token, now);
      out.push(Object.assign({ params }, r || inactive()));
    } catch (err) {
      console.warn(`[veille-emploi] "${motcle}" (${dep}) : ${err.message} → inactive.`);
      out.push(Object.assign({ params }, inactive()));
    }
  }
  return out;
}

module.exports = { id: 'veille-emploi', paramsSchema, checkWithParams };
