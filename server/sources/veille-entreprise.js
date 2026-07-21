// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE D'ENTREPRISE. L'abonné saisit un SIREN ; la source
// alerte sur un changement IMPRÉVISIBLE de la fiche : radiation/cessation (état administratif
// A→C), changement de dénomination, ou changement de dirigeant(s).
//
// API publique officielle, SANS clé (proxy INSEE + RNE) — testée en réel le 21/07/2026 :
//   GET https://recherche-entreprises.api.gouv.fr/search?q=<SIREN>&per_page=1
//   → { results: [ { siren, etat_administratif:'A'|'C', nom_complet, dirigeants:[{nom,prenoms,
//     qualite}], date_mise_a_jour_insee, date_mise_a_jour_rne, … } ] }.
//
// ── INITIALISATION SANS ALERTE RÉTROACTIVE (CRITIQUE) ─────────────────────────
// Au 1er passage sur un SIREN, on MÉMORISE la signature courante (état/dénomination/dirigeants)
// comme RÉFÉRENCE, SANS alerter : une entreprise DÉJÀ radiée au moment de la souscription ne
// déclenche AUCUNE alerte. Seul un changement APRÈS la souscription compte. Cache mémoire (comme
// hausse-tarif) : un redémarrage ré-initialise la référence → jamais de faux positif rétroactif.
//
// Contrairement au hash-diff aveugle (veille-page), ici les champs sont STRUCTURÉS : on peut donc
// dire FACTUELLEMENT ce qui a changé (radiation, dénomination, dirigeant).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://recherche-entreprises.api.gouv.fr/search';
const PUBLIC_URL = 'https://annuaire-entreprises.data.gouv.fr/entreprise/';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // la donnée bouge lentement, 2 checks/jour suffisent
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const SIREN_RE = /^\d{9}$/;

const paramsSchema = [
  {
    key: 'siren',
    label: 'SIREN de l\'entreprise',
    type: 'string',
    placeholder: '552032534',
    pattern: '^\\d{9}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Le SIREN à 9 chiffres de l\'entreprise (ex. Danone = 552032534). Alerte en cas de radiation, changement de nom ou de dirigeant.',
  },
];

// Cache par SIREN : { sig, at, result }. sig = { etat, nom, dirKey }.
const cache = new Map();

function inactive(siren) {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL + (SIREN_RE.test(siren) ? siren : '') };
}

// Clé stable des dirigeants (nom prénoms qualité, triés) pour détecter un changement.
function dirigeantsKey(list) {
  if (!Array.isArray(list)) return '';
  return list.map((d) => [d && d.nom, d && d.prenoms, d && d.qualite].filter(Boolean).join(' ').trim().toLowerCase())
    .filter(Boolean).sort().join(' | ');
}

async function fetchEntreprise(siren) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${API}?q=${encodeURIComponent(siren)}&per_page=1`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const rows = Array.isArray(body.results) ? body.results : [];
  // On exige le bon SIREN (la recherche plein-texte pourrait renvoyer un voisin).
  return rows.find((r) => String(r.siren) === siren) || null;
}

function signatureOf(rec) {
  return {
    etat: rec.etat_administratif || null,
    nom: (rec.nom_complet || rec.nom_raison_sociale || '').trim(),
    dirKey: dirigeantsKey(rec.dirigeants),
  };
}

// Construit le message factuel décrivant CE QUI a changé (données structurées).
function describeChange(prev, cur, nom, siren) {
  const parts = [];
  if (prev.etat !== cur.etat && cur.etat === 'C') parts.push('elle a été radiée / a cessé son activité');
  else if (prev.etat !== cur.etat && cur.etat === 'A') parts.push('elle est de nouveau active');
  if (prev.nom !== cur.nom && cur.nom) parts.push(`nouvelle dénomination : « ${cur.nom} »`);
  if (prev.dirKey !== cur.dirKey) parts.push('changement de dirigeant(s)');
  const what = parts.length ? parts.join(' ; ') : 'sa fiche a été mise à jour';
  return `🏢 Changement pour ${nom || ('SIREN ' + siren)} : ${what}. À vérifier sur l'annuaire des entreprises.`;
}

async function checkOne(params, now) {
  const siren = String((params && params.siren) || '').trim();
  if (!SIREN_RE.test(siren)) return Object.assign({ params }, inactive(siren));

  const entry = cache.get(siren);
  if (entry && now - entry.at < CACHE_TTL_MS) return Object.assign({ params }, entry.result);

  let rec;
  try { rec = await fetchEntreprise(siren); }
  catch (err) {
    console.warn(`[veille-entreprise] ${siren} : ${err.message} → inactive.`);
    return Object.assign({ params }, entry ? entry.result : inactive(siren));
  }
  if (!rec) { const r = inactive(siren); cache.set(siren, { sig: entry ? entry.sig : null, at: now, result: r }); return Object.assign({ params }, r); }

  const sig = signatureOf(rec);
  const nom = sig.nom;
  let result;
  if (!entry || !entry.sig) {
    result = inactive(siren); // 1er passage : référence mémorisée, AUCUNE alerte (même si déjà radiée)
  } else if (entry.sig.etat !== sig.etat || entry.sig.nom !== sig.nom || entry.sig.dirKey !== sig.dirKey) {
    result = { state: 'active', since: new Date(), until: null, message: describeChange(entry.sig, sig, nom, siren), url: PUBLIC_URL + siren };
  } else {
    result = inactive(siren);
  }
  cache.set(siren, { sig, at: now, result });
  return Object.assign({ params }, result);
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  let fetches = 0;
  for (const params of combos) {
    const siren = String((params && params.siren) || '').trim();
    const cached = cache.get(siren);
    // Respecte le plafond de fetchs réels par cycle (les combos en cache sont rejouées).
    if (cached && now - cached.at < CACHE_TTL_MS) { out.push(Object.assign({ params }, cached.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, cached ? cached.result : inactive(siren))); continue; }
    fetches += 1;
    out.push(await checkOne(params, now));
  }
  return out;
}

module.exports = { id: 'veille-entreprise', paramsSchema, checkWithParams };
