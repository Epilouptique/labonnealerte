// Source interne : EcoWatt (RTE) — signal national de tension du système
// électrique français. 2e source API publique officielle, avec OAuth2.
//
// API : /open_api/ecowatt/v5/signals (v4 retiré). Auth Bearer via rte-auth.
// Rate limit strict : 1 appel / 15 min. Le poller tourne toutes les 30 min.
//
// 2026-11-17 — CACHE + TOLÉRANCE (fin des HTTP 429 bruyants) :
//   · Les signaux EcoWatt ne changent que quelques fois par jour → cache de SUCCÈS
//     en mémoire, TTL 1 h : dans l'heure, on ressert le dernier état SANS rappeler RTE.
//   · Après un échec (429 notamment), on ne RÉ-appelle pas RTE avant RETRY_MS (anti-
//     martèlement) : on ressert le dernier bon état connu s'il a moins de 6 h
//     (MAX_FALLBACK_AGE_MS), sinon « inactive » — jamais un état périmé.
//   · Le check est enveloppé par withFailThreshold (seuil N=3, patron veille-rss) : un
//     429/timeout isolé reste SILENCIEUX (repli = dernier bon état < 6 h), seule une panne
//     DURABLE (3 échecs consécutifs) devient un incident 'failed' côté poller.
//   Patron de cache repris de veille-page.js / veille-rss.js (TTL succès + RETRY court).
//   La logique d'alerte (extractEcowatt) est INCHANGÉE : seuls ORANGE (2) et ROUGE (3)
//   déclenchent, since/until/message identiques.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getToken } = require('../rte-auth');
const { withFailThreshold, freshFallback } = require('./lib/fail-threshold');

const SIGNALS_URL = 'https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals';
const PUBLIC_URL = 'https://www.monecowatt.fr';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000;   // succès : 1 h (poll réel 2×/h → ~1 appel RTE/h)
const RETRY_MS = 10 * 60 * 1000;       // échec : on ne rappelle pas RTE avant 10 min
const MAX_FALLBACK_AGE_MS = 6 * 60 * 60 * 1000; // repli : au-delà de 6 h, ne pas resservir
                                       // un état périmé → inactiveResult(). Borne l'âge du
                                       // dernier bon état connu (chemin « échec récent » ET
                                       // fallback withFailThreshold), sinon un 'active' avec
                                       // until déjà dépassé pourrait stagner indéfiniment.

// dvalue : 1 vert · 2 orange · 3 rouge.
const COLOR_LABEL = { 2: 'ORANGE', 3: 'ROUGE' };

// Caches en mémoire (une seule instance serveur, comme le reste du projet).
let okCache = null;    // { at:number, result }
let lastFailAt = 0;    // horodatage du dernier échec réseau

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactiveResult() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Repli borné en âge (helper factorisé dans lib/fail-threshold) : le dernier bon état
// connu s'il a moins de MAX_FALLBACK_AGE_MS, sinon « inactive ». Évite de resservir un
// état périmé (ex. un 'active' dont l'until est déjà passé). Utilisé par le chemin
// « échec récent » ET par le fallback N=3.
const boundedFallback = freshFallback(() => okCache, MAX_FALLBACK_AGE_MS, inactiveResult);

// Appel réseau brut à l'API RTE. Lève sur token refusé / 429 / HTTP inattendu / JSON
// illisible / timeout (messages inchangés). Isolé pour permettre l'injection en test.
async function fetchSignals() {
  const token = await getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(SIGNALS_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API EcoWatt (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API EcoWatt échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`EcoWatt : token/identifiants refusés (HTTP ${res.status})`);
  }
  if (res.status === 429) {
    throw new Error('EcoWatt : appel trop fréquent (HTTP 429), prochain cycle');
  }
  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue EcoWatt : ${res.status} ${res.statusText}`);
  }

  try {
    return await res.json();
  } catch (err) {
    throw new Error(`Réponse EcoWatt illisible (JSON invalide) : ${err.message}`);
  }
}

/**
 * Vérifie l'état instantané EcoWatt (jours J et J+1), avec cache.
 * opts._fetchSignals : injection du fetcher réseau (tests uniquement).
 * @returns {Promise<{ state:'active'|'inactive', since:Date|null, until:Date|null, message:string|null, url:string }>}
 */
async function checkRaw(opts = {}) {
  const now = Date.now();
  const fetchImpl = (opts && opts._fetchSignals) || fetchSignals;

  // 1) Cache de succès frais → aucun appel réseau (cœur de l'anti-429).
  if (okCache && now - okCache.at < CACHE_TTL_MS) return okCache.result;

  // 2) Échec récent → ne pas marteler RTE : on ressert le dernier bon état connu,
  //    mais seulement s'il n'est pas périmé (borne MAX_FALLBACK_AGE_MS).
  if (now - lastFailAt < RETRY_MS) {
    return boundedFallback();
  }

  // 3) Appel réseau réel.
  let payload;
  try {
    payload = await fetchImpl();
  } catch (err) {
    lastFailAt = Date.now();
    throw err; // remonte à withFailThreshold
  }
  const result = extractEcowatt(payload);
  okCache = { at: Date.now(), result };
  return result;
}

/**
 * Extrait l'état à partir des signaux J et J+1.
 * Structure v5 : { signals: [{ jour (ISO), dvalue (1|2|3), message, values[] }, ...] }
 * signals[0] = aujourd'hui (J), signals[1] = demain (J+1).
 */
function extractEcowatt(payload) {
  const signals = payload?.signals;
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new Error('Structure EcoWatt inattendue : signals[] manquant');
  }

  const today = signals[0];
  const tomorrow = signals[1];
  const concerned = []; // { day, label, message, since, until }

  [{ sig: today, prefix: "⚡ Aujourd'hui" }, { sig: tomorrow, prefix: '⚡ Demain' }].forEach((entry) => {
    const sig = entry.sig;
    if (!sig) return;
    const dvalue = Number(sig.dvalue) || 0;
    if (dvalue < 2) return; // vert : rien
    const label = COLOR_LABEL[dvalue] || 'ORANGE';
    const start = parseDate(sig.jour);
    const end = start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
    concerned.push({
      label,
      line: `${entry.prefix} : ${label} — ${sig.message || 'système électrique tendu'}`,
      since: start,
      until: end,
    });
  });

  if (concerned.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const since = concerned[0].since;
  const until = concerned[concerned.length - 1].until;

  return {
    state: 'active',
    since,
    until,
    message: concerned.map((c) => c.line).join('\n'),
    url: PUBLIC_URL,
  };
}

// Enveloppe seuil N=3 : un échec isolé est avalé (repli = dernier bon état connu, sinon
// inactive), une panne durable (3 échecs consécutifs) devient un incident côté poller.
const check = withFailThreshold('ecowatt', checkRaw, {
  threshold: 3,
  fallback: boundedFallback,
});

module.exports = {
  id: 'ecowatt',
  check,
  extractEcowatt,
  _test: {
    raw: checkRaw,
    reset() { okCache = null; lastFailAt = 0; },
    peekCache: () => okCache,
  },
};
