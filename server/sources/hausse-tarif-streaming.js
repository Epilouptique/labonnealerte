// Source PARAMÉTRÉE (OpenAlert v2) : alerte quand la page TARIFS d'un service de streaming
// CHANGE (indice possible d'une évolution de prix). PHASE 1 : Netflix + Deezer uniquement.
//
// CONVENTION « Bison Futé » : on n'interprète JAMAIS le contenu. On extrait le TEXTE VISIBLE de
// la page tarifs, on le denoise et on le HASHE (lib/hash-diff-html, déjà en prod pour veille-page
// / veille-stock). Un hash différent = « quelque chose a changé », JAMAIS « le prix est X ». Le
// message reste factuel (« changement détecté »), sans montant ni prix annoncé.
//
// ── RÉFÉRENCE AU 1er CYCLE, SANS ALERTE ──────────────────────────────────────
// Au 1er passage sur un service, on mémorise le hash courant comme RÉFÉRENCE sans alerter. Seul
// un hash DIFFÉRENT ensuite déclenche (puis devient la nouvelle référence). Cache mémoire.
//
// ── QUOTA ────────────────────────────────────────────────────────────────────
// Les prix changent rarement → TTL de plusieurs jours (rythme ~hebdomadaire), mutualisé PAR
// service (pas par abonné). Dégradation silencieuse sur échec (jamais de fausse alerte).
//
// ── PHASE 2 (NON codée ici — TODO référence future) ──────────────────────────
// Les services suivants sont ÉCARTÉS de la phase 1 car leurs pages tarifs sont des SPA à rendu
// JavaScript (hash du HTML brut instable / vide) ou protègent l'accès (anti-bot) → nécessiteraient
// un rendu headless (Playwright) avant hash. À réévaluer si une phase 2 headless est décidée :
//   · Spotify      — premium : SPA React, tarifs chargés en JS.
//   · Disney+      — SPA, géo-redirections, anti-bot.
//   · YouTube (Premium) — SPA, tarifs derrière consentement/JS.
//   · Apple TV+    — SPA, contenu rendu client.
//   · Canal+       — parcours JS + anti-bot.
//   · Prime Video  — Amazon, anti-bot fort + SPA.
// L'enum ci-dessous est extensible SANS migration lourde : ajouter une entrée { value, label }
// + une URL dans SERVICES suffira le jour où l'une passe en « server-rendered » ou via headless.

const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
const { hashHtml } = require('./lib/hash-diff-html');

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // ~hebdomadaire : les prix bougent rarement
const RETRY_MS = 12 * 60 * 60 * 1000;   // après un échec, on retente plus tôt
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Services PHASE 1 : pages tarifs « server-rendered » (hash exploitable).
const SERVICES = {
  netflix: { nom: 'Netflix', url: 'https://help.netflix.com/fr/node/24926' },
  deezer: { nom: 'Deezer', url: 'https://www.deezer.com/fr/offers' },
};

const paramsSchema = [
  {
    key: 'service',
    label: 'Service de streaming',
    type: 'enum',
    values: Object.keys(SERVICES).map((k) => ({ value: k, label: SERVICES[k].nom })),
    multiple: true,
    required: true,
    default: null,
    hint: 'Vous êtes prévenu quand la page des tarifs de ce service change (indice possible d\'évolution de prix). Aucun montant n\'est interprété ni annoncé.',
  },
];

// Cache par service : { hash, at, ttl, result }.
const cache = new Map();

function inactive(service) {
  const s = SERVICES[service];
  return { state: 'inactive', since: null, until: null, message: null, url: s ? s.url : 'https://www.labonnealerte.fr' };
}

async function hashOf(url) {
  const html = await safeFetchText(url, {
    timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: 'text/html',
    headers: { 'User-Agent': BROWSER_UA },
  });
  return hashHtml(html).hash;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const service = String((params && params.service) || '');
    const svc = SERVICES[service];
    if (!svc) { out.push(Object.assign({ params }, inactive(service))); continue; }

    const entry = cache.get(service);
    if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(service))); continue; }
    fetches += 1;

    let result;
    try {
      const hash = await hashOf(svc.url);
      if (!entry || !entry.hash) {
        result = inactive(service); // 1re empreinte = référence, AUCUNE alerte
        cache.set(service, { hash, at: now, ttl: TTL_MS, result });
      } else if (hash !== entry.hash) {
        result = {
          state: 'active', since: new Date(), until: null,
          message: `💶 Changement détecté sur la page des tarifs ${svc.nom}. Vérifiez si une évolution de prix vous concerne.`,
          url: svc.url,
        };
        cache.set(service, { hash, at: now, ttl: TTL_MS, result }); // le nouveau hash devient la référence
      } else {
        result = inactive(service);
        cache.set(service, { hash, at: now, ttl: TTL_MS, result });
      }
    } catch (err) {
      console.warn(`[hausse-tarif-streaming] ${service} : ${err.message} → inactive.`);
      result = inactive(service);
      // On CONSERVE le hash de référence (ne pas le perdre sur un échec transitoire), TTL court.
      cache.set(service, { hash: entry ? entry.hash : null, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'hausse-tarif-streaming', paramsSchema, checkWithParams, _test: { cache } };
