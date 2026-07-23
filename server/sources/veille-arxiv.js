// Source PARAMÉTRÉE (OpenAlert v2) : veille de recherche — nouveau PREPRINT arXiv correspondant
// à un MOT-CLÉ suivi. Même esprit que veille-legifrance (mot-clé, nouvelle publication = alerte).
//
// API arXiv (SANS clé) : http://export.arxiv.org/api/query (Atom XML).
//   GET .../api/query?search_query=all:<motcle>&sortBy=submittedDate&sortOrder=descending&max_results=N
//   → <entry> { <id>http://arxiv.org/abs/2607.11697v1</id>, <title>, <published>, <summary> }.
//
// ⚠️ THROTTLE arXiv : ~1 requête / 3 s max (règle explicite d'arXiv). On sérialise les appels du
// cycle avec un espacement ≥ 3 s (throttle module-level), et on plafonne le nombre de mots-clés.
//
// ── ANTI-RÉTROACTIF ──────────────────────────────────────────────────────────
// Au 1er passage sur un mot-clé, on mémorise les identifiants arXiv courants comme RÉFÉRENCE,
// SANS alerter (déjà publiés avant la souscription). Seul un identifiant JAMAIS vu déclenche.
// Dédoublonnage par identifiant arXiv (numéro SANS version, pour ne pas ré-alerter sur un v2).
//
// ── HONNÊTETÉ SCIENTIFIQUE ───────────────────────────────────────────────────
// arXiv héberge des PREPRINTS : le message précise explicitement « preprint, pas encore relu
// par les pairs ». On ne présente jamais un preprint comme un résultat validé.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://export.arxiv.org/api/query';
const PUBLIC_URL = 'https://arxiv.org/';
const TIMEOUT_MS = 12_000;
const MAX_RESULTS = 15;
const THROTTLE_MS = 3_000; // ≥ 3 s entre deux appels arXiv (règle arXiv)
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'motcle',
    label: 'Mot-clé de recherche',
    type: 'string',
    placeholder: 'exoplanet, graphene, transformer…',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Un mot-clé (de préférence en anglais). Alerte à la publication d\'un nouveau preprint arXiv correspondant. Ce sont des preprints, pas encore relus par les pairs.',
  },
];

// motcleNorm → { seen:Set<arxivId> }. Cache mémoire (réinit sûre au redémarrage).
const comboCache = new Map();
let lastFetchAt = 0; // throttle module-level partagé par tous les combos du cycle

function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function decode(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// Identifiant arXiv canonique (sans version) depuis une URL <id> ou un id brut.
function arxivId(idUrl) {
  const m = String(idUrl || '').match(/arxiv\.org\/abs\/(.+)$/i);
  const raw = m ? m[1] : String(idUrl || '');
  return raw.replace(/v\d+$/i, '').trim();
}

// Parse les <entry> d'un flux Atom arXiv → [{ id, titre, publie, absUrl }] (le plus récent d'abord).
function parseEntries(xml) {
  const entries = String(xml || '').match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const e of entries) {
    const idm = e.match(/<id>([\s\S]*?)<\/id>/i);
    if (!idm) continue;
    const id = arxivId(idm[1]);
    if (!id) continue;
    const tm = e.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pm = e.match(/<published>([\s\S]*?)<\/published>/i);
    out.push({
      id,
      titre: decode(tm ? tm[1] : ''),
      publie: pm ? new Date(decode(pm[1])) : null,
      absUrl: 'https://arxiv.org/abs/' + id,
    });
  }
  return out;
}

async function fetchArxiv(motcle) {
  // Throttle : respecter ≥ THROTTLE_MS depuis le dernier appel (tous combos confondus).
  const wait = THROTTLE_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const url = API + '?search_query=' + encodeURIComponent('all:' + motcle)
    + '&sortBy=submittedDate&sortOrder=descending&max_results=' + MAX_RESULTS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/atom+xml' }, signal: controller.signal });
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseEntries(await res.text());
}

async function checkOne(params) {
  const motcle = String((params && params.motcle) || '').trim();
  if (!motcle) return Object.assign({ params }, inactive());
  const key = norm(motcle);

  let entries;
  try { entries = await fetchArxiv(motcle); }
  catch (err) {
    console.warn(`[veille-arxiv] « ${motcle} » : ${err.message} → inactive.`);
    return Object.assign({ params }, inactive());
  }
  const ids = entries.map((e) => e.id);
  const entry = comboCache.get(key);

  if (!entry) {
    comboCache.set(key, { seen: new Set(ids) }); // 1er passage : référence, pas d'alerte
    return Object.assign({ params }, inactive());
  }
  const nouveaux = entries.filter((e) => !entry.seen.has(e.id));
  ids.forEach((id) => entry.seen.add(id));
  if (!nouveaux.length) return Object.assign({ params }, inactive());

  const a = nouveaux[0]; // le plus récent (flux trié submittedDate desc)
  return {
    params,
    state: 'active',
    since: a.publie && !Number.isNaN(a.publie.getTime()) ? a.publie : new Date(),
    until: null,
    message: `📄 Nouveau preprint arXiv pour « ${motcle} » : ${a.titre || a.id} (preprint, pas encore relu par les pairs).`,
    url: a.absUrl,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[veille-arxiv] ${combos.length} mots-clés — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const out = [];
  for (const params of combos) out.push(await checkOne(params)); // séquentiel = respecte le throttle
  return out;
}

module.exports = { id: 'veille-arxiv', paramsSchema, checkWithParams, _test: { comboCache, norm } };
