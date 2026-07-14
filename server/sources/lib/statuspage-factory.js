// Factory « source de statut » basée sur le standard Atlassian Statuspage.
//
// La plupart des grands services tech exposent leur statut à ce format :
//   GET <statusHost>/api/v2/status.json
//     → { page, status: { indicator: "none"|"minor"|"major"|"critical", description } }
//   GET <statusHost>/api/v2/summary.json  (optionnel)
//     → { incidents: [{ name, impact, created_at, ... }], ... }
// Public, sans clé.
//
// ─────────────────────────────────────────────────────────────────────────────
// AJOUTER UNE NOUVELLE SOURCE DE STATUT EN 2 LIGNES (futures vagues) :
//   1. Créer server/sources/statut-<service>.js :
//        const { createStatusSource } = require('./lib/statuspage-factory');
//        module.exports = createStatusSource({
//          id: 'statut-<service>', serviceName: '<Service>',
//          statusHost: 'https://status.<service>.com', url: 'https://status.<service>.com',
//        });
//   2. Ajouter l'INSERT idempotent (+ source_states) dans server/db/init.sql,
//      sur le modèle des sources 'statut-*' existantes (requires_confirmation = true
//      pour l'anti-flapping).
// C'est tout : le poller charge automatiquement le nouveau fichier.
// ─────────────────────────────────────────────────────────────────────────────

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TIMEOUT_MS = 10_000;

// On ne notifie QUE les pannes majeures (anti-spam) : "minor" est ignoré.
const MAJOR = new Set(['major', 'critical']);

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout (${url}, >${TIMEOUT_MS} ms)`);
    throw new Error(`Appel échoué (${url}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue (${url}) : ${res.status} ${res.statusText}`);
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`Réponse illisible (${url}, JSON invalide) : ${err.message}`);
  }
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Crée une source de statut pour un service au format Statuspage.
 * @param {{ id:string, serviceName:string, statusHost:string, url:string }} cfg
 * @returns {{ id:string, check: () => Promise<object> }}
 */
function createStatusSource(cfg) {
  const { id, serviceName, statusHost, url } = cfg;
  const STATUS_URL = `${statusHost.replace(/\/$/, '')}/api/v2/status.json`;
  const SUMMARY_URL = `${statusHost.replace(/\/$/, '')}/api/v2/summary.json`;

  async function check() {
    const payload = await getJson(STATUS_URL);
    const status = payload && payload.status;
    if (!status || typeof status.indicator !== 'string') {
      throw new Error(`Structure Statuspage inattendue (${serviceName}) : status.indicator manquant`);
    }

    // Seules les pannes majeures/critiques déclenchent (anti-spam).
    if (!MAJOR.has(status.indicator)) {
      return { state: 'inactive', since: null, until: null, message: null, url };
    }

    // Complément best-effort : nommer le(s) incident(s) major/critical en cours.
    let incidentText = status.description || 'panne en cours';
    let since = null;
    try {
      const summary = await getJson(SUMMARY_URL);
      const incidents = Array.isArray(summary && summary.incidents) ? summary.incidents : [];
      const major = incidents.filter((i) => i && MAJOR.has(i.impact));
      if (major.length) {
        incidentText = major.map((i) => i.name).filter(Boolean).join(' · ') || incidentText;
        // since = created_at le plus ancien parmi les incidents majeurs en cours.
        major.forEach((i) => {
          const d = parseDate(i.created_at || i.started_at);
          if (d && (!since || d < since)) since = d;
        });
      }
    } catch (err) {
      // summary indisponible : on garde status.description.
      console.warn(`[statuspage] ${id} : summary indisponible (${err.message})`);
    }

    return {
      state: 'active',
      since: since || new Date(), // à défaut : première détection
      until: null,                // fin inconnue par nature
      message: `⚠️ ${serviceName} rencontre une panne majeure : ${incidentText}`,
      url,
    };
  }

  return { id, check };
}

module.exports = { createStatusSource };
