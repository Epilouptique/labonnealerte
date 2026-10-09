// Test hors ligne — PALIER 1 : 10 sources qui AVALAIENT leurs erreurs en renvoyant « inactive »
// doivent désormais PROPAGER l'erreur de surveillance. Quand check()/checkWithParams lève, le
// poller journalise un incident 'failed' (1/h), ne notifie personne et conserve l'état précédent.
//
// On force un fetch en erreur (403, 503, timeout AbortError) pour chaque source et on vérifie :
//   • source NON PARAMÉTRÉE (tempo) : via le VRAI poller → incident() (1 'failed', 0 écriture
//     d'état, 0 notification) ;
//   • source PARAMÉTRÉE (les 9 autres) : appel DIRECT de checkWithParams([...combos...]) et on
//     assert que ça LÈVE (rejet).
// On vérifie aussi que les inactive LÉGITIMES (sous le seuil, 404 ressource absente, codeJour non
// rouge) restent des inactive, pas des throws.
//
// Vrais connecteurs et vrai poller ; node-fetch, fetch global, safe-fetch, base, e-mails et push
// SIMULÉS. Aucun appel réseau, aucune base. Usage : node scripts/test-sources-incident-palier1.js
'use strict';
const path = require('path');
const Module = require('module');
const SRV = path.join(__dirname, '..', 'server');

// Clés/URL lues À LA CHARGE des modules → à poser AVANT tout require de source.
process.env.METEOFRANCE_VIGILANCE_API_KEY = 'test-key';
process.env.METEOFRANCE_VIGILANCE_OM_URL = 'https://example.invalid/vigilanceom';
process.env.METEOFRANCE_API_KEY = 'test-key';
process.env.URLHAUS_AUTH_KEY = 'test-key';

// node-fetch est importé dynamiquement (ESM) par la plupart des connecteurs : on le remplace par
// un module qui délègue à globalThis.__fetch, piloté par chaque cas.
Module.registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'node-fetch') {
      return { url: 'data:text/javascript,export default (...a) => globalThis.__fetch(...a);', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const stub = (rel, exports) => {
  const file = require.resolve(path.join(SRV, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// Base simulée : on enregistre chaque requête.
const queries = [];
stub('db', { pool: { query: async (sql, params) => {
  const q = sql.replace(/\s+/g, ' ').trim();
  queries.push({ q, params });
  if (q.startsWith('SELECT event, created_at FROM source_events')) return { rows: [] };
  if (q.startsWith('SELECT state')) return { rows: [{ state: 'inactive', since: null }] };
  return { rows: [] };
} } });
const notified = [];
stub('mailer', {
  sendPromoAlert: async (...a) => { notified.push(['mail', a]); },
  sendDeferredDigest: async (...a) => { notified.push(['digest', a]); },
});
stub('webpush', {
  sendToSource: async (...a) => { notified.push(['push', a]); },
  sendToSourceParams: async (...a) => { notified.push(['push', a]); },
  sendToSubscriber: async (...a) => { notified.push(['push', a]); },
});
stub('quiet-hours', { isQuietNow: () => false });
stub('sessions', { cleanupExpired: async () => {} });
stub('params', { resolveLabel: () => '' });
stub('external', { buildExternalSource: () => null });
stub('doomname', { trackDomain: async () => {} });
stub('leboncoin-promo-probe', { runProbe: async () => {} });
stub('user-tasks-notify', { runUserTaskNotify: async () => {} });
stub('community-reports-expire', { runCommunityReportsExpire: async () => {} });

// safe-fetch SIMULÉ : meteo-forets passe par safeFetchBuffer (pas par node-fetch). On délègue à
// globalThis.__fetch et on reproduit le mapping d'erreur de la vraie couche (404 vs autres).
const pubErr = (m) => { const e = new Error(m); e.public = true; return e; };
stub('safe-fetch', {
  safeFetchBuffer: async () => {
    let res;
    try { res = await globalThis.__fetch(); }
    catch (err) {
      if (err.name === 'AbortError') throw pubErr('Délai dépassé (>15s)');
      throw pubErr("Impossible de joindre l'URL");
    }
    if (!res.ok) throw pubErr(`Réponse HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
  safeFetchText: async () => '',
  safeFetchJson: async () => ({}),
  safeProbe: async () => ({ ok: true, status: 200, redirected: false, timedOut: false, error: null }),
  isPrivateIP: () => false,
  pubErr,
  BROWSER_UA: 'test',
});

const logs = [];
console.log = () => {};
console.warn = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));

const { processSource } = require(path.join(SRV, 'poller'));
const src = (id) => require(path.join(SRV, 'sources', id));

// Réponses simulées
const resp = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  arrayBuffer: async () => Buffer.from(typeof body === 'string' ? body : JSON.stringify(body || '')),
  headers: { get: () => null },
});
const timeout = () => { const e = new Error('The operation was aborted.'); e.name = 'AbortError'; return e; };

// fetch GLOBAL simulé (domaine-securite l'utilise directement, pas node-fetch).
globalThis.fetch = (...a) => globalThis.__fetch(...a);

let fails = 0;
const out = [];
const ok = (c, msg) => { out.push((c ? 'OK   ' : 'ECHEC') + ' ' + msg); if (!c) fails++; };

// ── Source NON PARAMÉTRÉE : passage par le vrai poller ───────────────────────
async function runPoller(source) {
  queries.length = 0; notified.length = 0;
  await processSource(source, false);
  return {
    failed: queries.filter((x) => x.q.startsWith('INSERT INTO source_events') && x.params[1] === 'failed'),
    stateWrites: queries.filter((x) => x.q.startsWith('UPDATE source_states')),
    otherEvents: queries.filter((x) => x.q.startsWith('INSERT INTO source_events') && x.params[1] !== 'failed'),
    notified: notified.length,
  };
}
const incident = (r, label, re) => {
  ok(r.failed.length === 1 && re.test(r.failed[0].params[2]), `${label} : 'failed' journalisé (« ${r.failed[0] ? r.failed[0].params[2] : '-'} »)`);
  ok(r.stateWrites.length === 0 && r.otherEvents.length === 0, `${label} : état précédent conservé, aucun autre événement`);
  ok(r.notified === 0, `${label} : aucune notification (e-mail ou push)`);
};

// ── Source PARAMÉTRÉE : checkWithParams doit LEVER ───────────────────────────
async function rejects(label, source, combos, re) {
  try {
    await source.checkWithParams(combos);
    ok(false, `${label} : checkWithParams aurait dû lever`);
  } catch (e) {
    ok(!re || re.test(e.message), `${label} : checkWithParams lève (« ${e.message} »)`);
  }
}
// Teste les trois chemins d'erreur (403, 503, timeout AbortError) d'une source paramétrée.
async function paramErrors(label, source, combos, res) {
  globalThis.__fetch = async () => resp(403, 'Forbidden');
  await rejects(`${label} 403`, source, combos, /403/);
  globalThis.__fetch = async () => resp(503, 'Unavailable');
  await rejects(`${label} 503`, source, combos, /503/);
  globalThis.__fetch = async () => { throw timeout(); };
  await rejects(`${label} timeout`, source, combos, res.timeoutRe);
}

(async () => {
  // ── 1. tempo (NON paramétrée) : via le vrai poller ─────────────────────────
  const tempo = src('tempo');
  globalThis.__fetch = async () => resp(403, 'Forbidden');
  incident(await runPoller(tempo), 'tempo 403', /403/);
  globalThis.__fetch = async () => resp(503, 'Unavailable');
  incident(await runPoller(tempo), 'tempo 503', /503/);
  globalThis.__fetch = async () => { throw timeout(); };
  incident(await runPoller(tempo), 'tempo timeout', /Timeout api-couleur-tempo/);
  // JSON illisible → incident aussi.
  globalThis.__fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
  incident(await runPoller(tempo), 'tempo JSON illisible', /JSON illisible/);
  // Inactive LÉGITIME conservé : jour bleu (codeJour 1) → inactive, pas d'incident.
  globalThis.__fetch = async () => resp(200, { codeJour: 1 });
  ok((await tempo.check()).state === 'inactive', 'tempo : jour bleu (codeJour 1) → inactive (légitime, pas d\'incident)');

  // ── 2. meteo-belgique ──────────────────────────────────────────────────────
  await paramErrors('meteo-belgique', src('meteo-belgique'), [{ province: 'liege' }], { timeoutRe: /Timeout MeteoAlarm BE/ });
  // Inactive LÉGITIME : flux 200 sans alerte orange+ pour la province → inactive, pas de throw.
  globalThis.__fetch = async () => resp(200, '<feed></feed>');
  ok((await src('meteo-belgique').checkWithParams([{ province: 'liege' }]))[0].state === 'inactive',
    'meteo-belgique : flux vide → inactive (légitime)');

  // ── 3. meteo-quebec ─────────────────────────────────────────────────────────
  await paramErrors('meteo-quebec', src('meteo-quebec'), [{ region: 'montreal' }], { timeoutRe: /Timeout ECCC/ });
  globalThis.__fetch = async () => resp(200, { features: [] });
  ok((await src('meteo-quebec').checkWithParams([{ region: 'montreal' }]))[0].state === 'inactive',
    'meteo-quebec : aucun avertissement → inactive (légitime)');

  // ── 4. meteo-europe ─────────────────────────────────────────────────────────
  await paramErrors('meteo-europe', src('meteo-europe'), [{ pays: 'espagne' }], { timeoutRe: /(Timeout|Délai|aborted)/i });

  // ── 5. meteo-forets (via safe-fetch) ────────────────────────────────────────
  await paramErrors('meteo-forets', src('meteo-forets'), [{ departement: '34' }], { timeoutRe: /Délai dépassé/ });

  // ── 6. vigilance-submersion ─────────────────────────────────────────────────
  await paramErrors('vigilance-submersion', src('vigilance-submersion'), [{ region: 'Bretagne' }], { timeoutRe: /Timeout DPVigilance/ });

  // ── 7. cyclones-outremer ─────────────────────────────────────────────────────
  await paramErrors('cyclones-outremer', src('cyclones-outremer'), [{ territoire: 'martinique' }], { timeoutRe: /Timeout Vigilance OM/ });

  // ── 8. veille-hydrometrie ────────────────────────────────────────────────────
  await paramErrors('veille-hydrometrie', src('veille-hydrometrie'), [{ station: 'O972001001', seuil: 1500 }], { timeoutRe: /Timeout Hub'Eau/ });
  // Inactive LÉGITIME : station inconnue (404) → inactive, pas de throw.
  globalThis.__fetch = async () => resp(404, 'not found');
  ok((await src('veille-hydrometrie').checkWithParams([{ station: 'Z999999999', seuil: 1500 }]))[0].state === 'inactive',
    'veille-hydrometrie : station 404 → inactive (légitime)');

  // ── 9. indice-uv ──────────────────────────────────────────────────────────────
  await paramErrors('indice-uv', src('indice-uv'), [{ departement: '06' }], { timeoutRe: /Timeout Open-Meteo/ });
  globalThis.__fetch = async () => resp(200, { daily: { uv_index_max: [3] } });
  ok((await src('indice-uv').checkWithParams([{ departement: '06' }]))[0].state === 'inactive',
    'indice-uv : UV 3 < seuil → inactive (légitime)');

  // ── 10. domaine-securite (fetch global) ────────────────────────────────────────
  await paramErrors('domaine-securite', src('domaine-securite'), [{ domaine: 'annad.fr' }], { timeoutRe: /./ });
  globalThis.__fetch = async () => resp(200, { query_status: 'no_results' });
  ok((await src('domaine-securite').checkWithParams([{ domaine: 'annad.fr' }]))[0].state === 'inactive',
    'domaine-securite : no_results → inactive (légitime)');

  console.info(out.join('\n'));
  console.info(fails ? `\n${fails} échec(s) sur ${out.length}.` : `\nTous les cas passent (${out.length}).`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.info('ERREUR FATALE : ' + e.stack); process.exit(1); });
