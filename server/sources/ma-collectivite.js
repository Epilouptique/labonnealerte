// Source PARAMÉTRÉE (OpenAlert v2) : MA COLLECTIVITÉ (PanneauPocket). Carte v2 où l'utilisateur
// saisit sa VILLE (jamais d'URL) et choisit son entité (mairie, ASA, syndicat…) dans une liste.
// La valeur stockée est l'URL /ville/ de l'entité — même format canonique que panneaupocket, donc
// même moteur de veille (factory lib/panneaupocket-veille.js).
//
// ── LOOKUP (résolution ville → entités) ──────────────────────────────────────
//   lookup(q) : q = nom de commune → geo.api.gouv.fr (nom, code INSEE, codes postaux) → département
//   (insee) → GET /public-api/city/FR-<dépt> (endpoint public PanneauPocket, sans auth, cache
//   mémoire 24h/dépt) → on garde les entités dont le CP appartient à la commune OU dont le nom
//   contient le nom de la commune. Tri : correspondances de NOM d'abord, puis voisines du même CP
//   par ordre alphabétique. Échec / département introuvable → [] propre (jamais de 500).
//   ⚠️ Pollution CP assumée : des collectivités voisines partageant le CP apparaissent (feature :
//   un habitant peut dépendre d'une ASA au CP voisin) — c'est l'utilisateur qui choisit.
//
// ── BACKLOG LOCAL ────────────────────────────────────────────────────────────
//   TODO v1.1 : désambiguïsation département du lookup — accepter « Saint-Denis 93 » /
//   « Saint-Denis (93) » et passer le dépt à geo.api (même pattern que le résolveur commune) ;
//   alternative future : biaiser par le dépt du profil si authentifié. Limite actuelle : lookup
//   résout au plus peuplé, un homonyme moins peuplé est inatteignable.
//
//   SURVEILLANCE 1er run : stabilité des ids ?panneau= à l'édition d'un panneau (si régénérés,
//   une modif apparaît comme « nouveau » — basculer la dédup sur un id interne le cas échéant).

const { safeFetchJson, BROWSER_UA } = require('../safe-fetch');
const { validPanneauUrl } = require('./lib/panneaupocket-parser');
const { createParamSource } = require('./lib/panneaupocket-veille');

const GEO_URL = 'https://geo.api.gouv.fr/communes';
const PP_API = 'https://app.panneaupocket.com/public-api/city/';
const DEPT_TTL_MS = 24 * 60 * 60 * 1000; // liste PanneauPocket par département : 24h
const MAX_OPTIONS = 25;

const paramsSchema = [
  {
    key: 'url',
    label: 'Votre ville',
    type: 'dynamic-enum',
    lookup: 'ma-collectivite',
    placeholder: 'Ex. Gap, Annecy, Bayonne…',
    pattern: '^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Saisissez votre commune, puis choisissez votre collectivité (mairie, syndicat des eaux, ASA…) dans la liste.',
  },
];

// Normalisation insensible casse/accents (apostrophes → espace).
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Département depuis un code INSEE : DROM/COM (97x/98x) sur 3 chiffres, sinon 2 (dont Corse 2A/2B).
function deptFromInsee(insee) {
  const s = String(insee || '').toUpperCase();
  return /^9[78]/.test(s) ? s.slice(0, 3) : s.slice(0, 2);
}

// Cache mémoire de la liste PanneauPocket par département : dept → { at, entities:[] }.
const deptCache = new Map();

async function fetchDeptEntities(dept) {
  const cached = deptCache.get(dept);
  if (cached && Date.now() - cached.at < DEPT_TTL_MS) return cached.entities;
  let entities = [];
  try {
    const data = await safeFetchJson(PP_API + 'FR-' + encodeURIComponent(dept), {
      maxBytes: 4 * 1024 * 1024, timeoutMs: 6000, headers: { 'User-Agent': BROWSER_UA },
    });
    entities = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[ma-collectivite] public-api FR-${dept} : ${err.message} → liste vide.`);
    return []; // ne pas mettre en cache un échec
  }
  deptCache.set(dept, { at: Date.now(), entities });
  return entities;
}

// q = nom de commune → options [{ label:"name — zipCode", value:url }].
async function lookup(q) {
  const raw = String(q || '').trim();
  if (raw.length < 2) return [];

  // 1) Commune via geo.api.gouv.fr : nom + code INSEE + codes postaux (le plus peuplé d'abord).
  let commune = null;
  try {
    const url = GEO_URL + '?nom=' + encodeURIComponent(raw)
      + '&fields=nom,code,codesPostaux,population&boost=population&limit=10';
    const list = await safeFetchJson(url, { maxBytes: 512 * 1024, timeoutMs: 6000 });
    if (Array.isArray(list) && list.length) {
      const wanted = norm(raw);
      const exact = list.filter((c) => norm(c.nom) === wanted);
      commune = (exact.length ? exact : list)[0]; // geo.api trie déjà par population
    }
  } catch (err) {
    console.warn(`[ma-collectivite] geo.api "${raw}" : ${err.message} → liste vide.`);
    return [];
  }
  if (!commune || !commune.code) return [];

  const dept = deptFromInsee(commune.code);
  const cps = new Set((commune.codesPostaux || []).map(String));
  const communeNorm = norm(commune.nom || raw);

  // 2) Liste PanneauPocket du département.
  const entities = await fetchDeptEntities(dept);
  if (!entities.length) return [];

  // 3) Filtre : CP de la commune OU nom de la commune contenu dans le nom de l'entité.
  const matched = entities.filter((e) => {
    if (!e || !e.url || !validPanneauUrl(e.url)) return false;
    const byCp = e.zipCode && cps.has(String(e.zipCode));
    const byName = communeNorm && norm(e.name || '').includes(communeNorm);
    return byCp || byName;
  });

  // 4) Tri : correspondances de NOM d'abord, puis alphabétique (nom).
  matched.sort((a, b) => {
    const an = norm(a.name || '').includes(communeNorm) ? 0 : 1;
    const bn = norm(b.name || '').includes(communeNorm) ? 0 : 1;
    if (an !== bn) return an - bn;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  });

  return matched.slice(0, MAX_OPTIONS).map((e) => ({
    label: `${e.name}${e.zipCode ? ' — ' + e.zipCode : ''}`,
    value: e.url,
  }));
}

const source = createParamSource({ id: 'ma-collectivite', paramsSchema });

module.exports = {
  id: source.id,
  paramsSchema,
  checkWithParams: source.checkWithParams,
  lookup,
  _lookup: lookup,
  _deptFromInsee: deptFromInsee,
};
