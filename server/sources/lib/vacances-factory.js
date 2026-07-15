// Factory Vacances scolaires (zones A / B / C).
//
// API : dataset officiel 'fr-en-calendrier-scolaire' sur data.education.gouv.fr
// (Opendatasoft explore v2.1, public sans clé). Un seul appel couvre les 3 zones :
// on mutualise via un cache mémoire 24h (1 appel/jour pour les 3 sources).
//
// STRUCTURE RÉELLE CONSTATÉE : records[].{ description ('Vacances de la Toussaint'…),
// start_date, end_date (ISO, minuit de Paris encodé en UTC ex. '…T22:00:00+00:00'),
// zones ('Zone A'|'Zone B'|'Zone C'|DOM…), population ('Élèves', 'Enseignants', '-'…),
// location (académie) }. Les dates sont dupliquées par académie → dédup nécessaire.
//
// Événement = le DÉPART en vacances. Fenêtre d'annonce : 7 jours avant le début.
// Pendant les vacances → inactive (l'intérêt, c'est le compte à rebours du départ).
//
// NB : sous-dossier lib/ → non chargé comme source par le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DATASET = 'fr-en-calendrier-scolaire';
const API_BASE = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h : 1 appel/jour partagé entre zones
const ERROR_TTL_MS = 5 * 60 * 1000;       // 5 min : évite de marteler l'API en erreur
const ANNOUNCE_MS = 7 * 24 * 60 * 60 * 1000;

const ZONES = ['Zone A', 'Zone B', 'Zone C'];

/* ------------------------------------------------------------------ */
/* Cache mémoire mutualisé + fetch unique en vol.                      */
/* ------------------------------------------------------------------ */
let cache = { at: 0, events: null, error: null };
let inflight = null;

async function doFetch() {
  console.log('[vacances-factory] appel API calendrier scolaire (mutualisé 3 zones)');
  const nowIso = new Date().toISOString();
  // group_by pour dédupliquer côté serveur (une ligne par zone/période/dates).
  const params = new URLSearchParams({
    group_by: 'zones,description,start_date,end_date',
    where: `zones in ("Zone A","Zone B","Zone C") and end_date > "${nowIso}"`,
    order_by: 'start_date',
    limit: '60',
  });
  const url = `${API_BASE}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API calendrier scolaire (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API calendrier scolaire échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue calendrier scolaire : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse calendrier scolaire illisible (JSON invalide) : ${err.message}`);
  }
  const results = payload && Array.isArray(payload.results) ? payload.results : [];

  // Dédup par zone + description + jour de début (les fins diffèrent selon population).
  const seen = new Set();
  const events = [];
  for (const r of results) {
    const start = new Date(r.start_date);
    if (Number.isNaN(start.getTime())) continue;
    const key = `${r.zones}|${r.description}|${dayKeyParis(start)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ zone: r.zones, description: r.description, start });
  }
  events.sort((a, b) => a.start - b.start);
  return events;
}

async function fetchEvents() {
  const now = Date.now();
  if (cache.events && now - cache.at < CACHE_TTL_MS) return cache.events;
  if (cache.error && now - cache.at < ERROR_TTL_MS) throw cache.error;
  if (inflight) return inflight;

  inflight = doFetch()
    .then((events) => { cache = { at: Date.now(), events, error: null }; return events; })
    .catch((err) => { cache = { at: Date.now(), events: null, error: err }; throw err; })
    .finally(() => { inflight = null; });
  return inflight;
}

function _resetCache() { cache = { at: 0, events: null, error: null }; inflight = null; }

/* ------------------------------------------------------------------ */
/* Formatage FR en fuseau Europe/Paris (les dates sont des minuits Paris). */
/* ------------------------------------------------------------------ */
function dayKeyParis(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function formatDepartParis(date) {
  // ex. « samedi 17 octobre »
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(date);
}

// « Vacances de la Toussaint » → « de la Toussaint » ; « Vacances d'Été » → « d'été ».
function nomVacances(description) {
  let s = String(description || '').replace(/^Vacances\s+/i, '').toLowerCase();
  // Re-capitalise les noms propres.
  s = s.replace(/\btoussaint\b/g, 'Toussaint').replace(/\bno[eë]l\b/gi, 'Noël');
  return s;
}

const ZONE_LETTER = { 'Zone A': 'A', 'Zone B': 'B', 'Zone C': 'C' };

/**
 * Crée une source « vacances scolaires » pour une zone.
 * @param {string} zone  'Zone A' | 'Zone B' | 'Zone C'
 */
function createVacancesSource(zone) {
  const letter = ZONE_LETTER[zone] || zone;
  const id = `vacances-zone-${String(letter).toLowerCase()}`;
  const publicUrl = 'https://www.education.gouv.fr/calendrier-scolaire';

  async function check() {
    const events = await fetchEvents(); // mutualisé (1 appel pour les 3 zones)
    const now = Date.now();

    // Prochaine période de la zone dont on est dans la fenêtre d'annonce [start-7j, start).
    let hit = null;
    for (const ev of events) {
      if (ev.zone !== zone) continue;
      const start = ev.start.getTime();
      if (now >= start - ANNOUNCE_MS && now < start) {
        if (!hit || ev.start < hit.start) hit = ev;
      }
    }

    if (!hit) {
      return { state: 'inactive', since: null, until: null, message: null, url: publicUrl };
    }
    return {
      state: 'active',
      since: new Date(hit.start.getTime() - ANNOUNCE_MS),
      until: hit.start,
      message: `🎒 Zone ${letter} : les vacances ${nomVacances(hit.description)} commencent le ${formatDepartParis(hit.start)}`,
      url: publicUrl,
    };
  }

  return { id, check };
}

/**
 * Source PARAMÉTRÉE (OpenAlert v2) : vacances scolaires, une ou plusieurs zones
 * au choix de l'abonné. Un seul appel API par cycle (cache mutualisé 24h), quel
 * que soit le nombre de zones. Contrat v2 : { id, paramsSchema, checkWithParams }.
 * paramsList = combinaisons souscrites, ex. [{ zone:'A' }, { zone:'C' }].
 */
function createVacancesParamSource(cfg) {
  const id = (cfg && cfg.id) || 'vacances-scolaires';
  const paramsSchema = cfg && cfg.paramsSchema;
  const publicUrl = 'https://www.education.gouv.fr/calendrier-scolaire';

  async function checkWithParams(paramsList) {
    const events = await fetchEvents(); // mutualisé (1 appel pour toutes les zones)
    const now = Date.now();
    const combos = Array.isArray(paramsList) ? paramsList : [];

    return combos.map((params) => {
      const letter = String((params && params.zone) || '').toUpperCase();
      const zone = `Zone ${letter}`;

      // Prochaine période de la zone dans la fenêtre d'annonce [start-7j, start).
      let hit = null;
      for (const ev of events) {
        if (ev.zone !== zone) continue;
        const start = ev.start.getTime();
        if (now >= start - ANNOUNCE_MS && now < start) {
          if (!hit || ev.start < hit.start) hit = ev;
        }
      }

      if (!hit) {
        return { params, state: 'inactive', since: null, until: null, message: null, url: publicUrl };
      }
      return {
        params,
        state: 'active',
        since: new Date(hit.start.getTime() - ANNOUNCE_MS),
        until: hit.start,
        message: `🎒 Zone ${letter} : les vacances ${nomVacances(hit.description)} commencent le ${formatDepartParis(hit.start)}`,
        url: publicUrl,
      };
    });
  }

  return { id, paramsSchema, checkWithParams };
}

module.exports = { createVacancesSource, createVacancesParamSource, _resetCache };
