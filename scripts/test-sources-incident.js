// Test hors ligne : une source en ERREUR doit passer en « incident de surveillance » (événement
// 'failed', état précédent conservé, AUCUNE notification) et non renvoyer « inactive ».
// Couvre eruption-volcanique (HTTP 403 du WAF GVP) et pannes-hydro-quebec (format de
// bisversion.json), plus les références sncf-perturbations (clé absente) et lancement-spatial
// (timeout). Vrais connecteurs et vrai poller ; node-fetch, base, e-mails et push SIMULÉS.
// Aucun appel réseau, aucune base. Usage : node scripts/test-sources-incident.js
'use strict';
const path = require('path');
const Module = require('module');
const SRV = path.join(__dirname, '..', 'server');

// node-fetch est importé dynamiquement (ESM) par les connecteurs : on le remplace par un module
// qui délègue à globalThis.__fetch, piloté par chaque cas.
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
});
const timeout = () => { const e = new Error('The operation was aborted.'); e.name = 'AbortError'; return e; };

let fails = 0;
const out = [];
const ok = (c, msg) => { out.push((c ? 'OK   ' : 'ECHEC') + ' ' + msg); if (!c) fails++; };

// Fait passer la source par le vrai poller et résume ce qui s'est passé.
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

(async () => {
  // ── eruption-volcanique ──
  const erup = src('eruption-volcanique');
  globalThis.__fetch = async () => resp(403, 'Forbidden');
  await erup.check().then(() => ok(false, 'eruption 403 : check doit lever'), (e) => ok(/403/.test(e.message), `eruption 403 : check lève (« ${e.message} »)`));
  incident(await runPoller(erup), 'eruption 403', /403/);
  globalThis.__fetch = async () => { throw timeout(); };
  incident(await runPoller(erup), 'eruption timeout', /Timeout GVP/);
  globalThis.__fetch = async () => resp(503, 'Unavailable');
  incident(await runPoller(erup), 'eruption 503', /503/);
  const rss = (t) => `<rss><channel><item><title>${t}</title><guid>${t}</guid><pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate><link>https://volcano.si.edu/x</link></item></channel></rss>`;
  globalThis.__fetch = async () => resp(200, rss('Etna (Italy) - Report for 1 October-7 October 2026 - New Eruptive Activity'));
  ok((await erup.check()).state === 'inactive', 'eruption 200 : 1er passage = amorçage, inactive (anti-rétroactif conservé)');
  globalThis.__fetch = async () => resp(200, rss('Fuego (Guatemala) - Report for 1 October-7 October 2026 - New Eruptive Activity'));
  const act = await erup.check();
  ok(act.state === 'active' && /Fuego/.test(act.message), 'eruption 200 : nouvelle entrée → active');
  globalThis.__fetch = async () => resp(403, 'Forbidden');
  await erup.check().catch(() => {});
  ok(erup._test.peek() && erup._test.peek().size === 2, 'eruption : une erreur ne réinitialise pas la référence (pas de fausse alerte au retour)');

  // ── pannes-hydro-quebec ──
  const hq = src('pannes-hydro-quebec');
  ok(hq._test.readVersion('20261009022006') === '20261009022006', 'hydro : version au format actuel (chaîne nue) lue');
  ok(hq._test.readVersion({ content: '20261009022006' }) === '20261009022006', 'hydro : ancien format { content } toujours lu');
  ok(hq._test.readVersion({}) === '' && hq._test.readVersion(null) === '', 'hydro : version absente → vide');
  const hqFetch = (version, markers) => async (url) => {
    if (url.endsWith('/bisversion.json')) return version;
    return markers;
  };
  globalThis.__fetch = hqFetch(resp(200, '20261009022006'), resp(200, { pannes: [[7, 'x'], [12000, 'y'], ['abc']] }));
  ok((await hq.check()).state === 'inactive', 'hydro : format actuel, 12 007 foyers < seuil → inactive (lecture réussie)');
  let urls = [];
  globalThis.__fetch = async (url) => { urls.push(url); return url.endsWith('/bisversion.json') ? resp(200, '20261009022006') : resp(200, { pannes: [[40000], [15000]] }); };
  const hqAct = await hq.check();
  ok(hqAct.state === 'active' && /55/.test(hqAct.message.replace(/\s/g, '')), 'hydro : 55 000 foyers → active');
  ok(urls[1] && urls[1].endsWith('/bismarkers20261009022006.json'), 'hydro : marqueurs lus avec la version du format actuel');
  globalThis.__fetch = hqFetch(resp(200, { autre: 1 }), resp(200, { pannes: [] }));
  incident(await runPoller(hq), 'hydro version illisible', /version bisversion\.json illisible/);
  globalThis.__fetch = hqFetch(resp(200, '20261009022006'), resp(200, { erreur: 'x' }));
  incident(await runPoller(hq), 'hydro liste illisible', /liste des pannes illisible/);
  globalThis.__fetch = hqFetch(resp(403, 'Forbidden'), resp(200, { pannes: [] }));
  incident(await runPoller(hq), 'hydro 403', /403/);
  globalThis.__fetch = async () => { throw timeout(); };
  incident(await runPoller(hq), 'hydro timeout', /Timeout Hydro-Québec/);

  // ── Références : même règle ──
  delete process.env.SNCF_API_KEY;
  incident(await runPoller(src('sncf-perturbations')), 'sncf-perturbations clé absente', /SNCF_API_KEY absente/);
  globalThis.__fetch = async () => { throw timeout(); };
  incident(await runPoller(src('lancement-spatial')), 'lancement-spatial timeout', /Timeout API Launch Library/);

  // Plus aucune ligne « → inactive » pour les deux sources corrigées.
  ok(!logs.some((l) => /\[(eruption-volcanique|pannes-hydro-quebec)\].*inactive/.test(l)), 'aucun journal « → inactive » pour les deux sources');

  console.info(out.join('\n'));
  console.info(fails ? `\n${fails} échec(s)` : `\nTous les cas passent (${out.length}).`);
  process.exit(fails ? 1 : 0);
})();
