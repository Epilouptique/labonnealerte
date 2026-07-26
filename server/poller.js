const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { pool } = require('./db');
const { sendPromoAlert, sendDeferredDigest } = require('./mailer');
const { sendToSource, sendToSourceParams, sendToSubscriber } = require('./webpush');
const { isQuietNow } = require('./quiet-hours');
const { cleanupExpired } = require('./sessions');
const { resolveLabel } = require('./params');
const { buildExternalSource } = require('./external');
const { trackDomain } = require('./doomname');
const { runProbe } = require('./leboncoin-promo-probe'); // OBSERVATION leboncoin (cron dédié, cf. startPoller)

// Purge des sessions expirées : au plus une fois par jour.
let lastSessionCleanup = 0;

// Toutes les 30 minutes
const SCHEDULE = '*/30 * * * *';

// Charge dynamiquement tous les modules de server/sources/.
// Contrat d'une source : { id, check() }  (broadcast, v1)
//   OU { id, paramsSchema, checkWithParams(paramsList) }  (paramétrée, v2).
function loadSources() {
  const dir = path.join(__dirname, 'sources');
  if (!fs.existsSync(dir)) return [];

  // Fichiers .js à la racine de sources/ uniquement : les sous-dossiers (lib/,
  // helpers partagés comme la factory vigilance) ne sont PAS chargés comme sources.
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => require(path.join(dir, e.name)))
    .filter((mod) => mod && mod.id &&
      (typeof mod.check === 'function' || typeof mod.checkWithParams === 'function'));
}

const SOURCES = loadSources();

// Abonnés confirmés à CETTE source qui ont GARDÉ l'email activé (email + token
// pour la désinscription 1-clic). Le push a son propre opt-in, indépendant.
async function confirmedEmailsForSource(sourceId) {
  const { rows } = await pool.query(
    `SELECT s.email, s.token
       FROM subscribers s
       JOIN subscriptions sub ON sub.subscriber_id = s.id
      WHERE sub.source_id = $1 AND s.confirmed = true AND s.email_enabled = true AND sub.muted = false`,
    [sourceId]
  );
  return rows.map((r) => ({ email: r.email, token: r.token }));
}

// Abonnés (confirmés) d'une alerte, avec leurs préférences de veille et le nombre
// d'appareils push. params=null → broadcast ; sinon combinaison paramétrée.
async function loadSubscribersForAlert(sourceId, params) {
  const paramsCond = params ? 'sub.params = $2::jsonb' : 'sub.params IS NULL';
  const args = params ? [sourceId, JSON.stringify(params)] : [sourceId];
  const { rows } = await pool.query(
    `SELECT s.id, s.email, s.token, s.email_enabled,
            s.quiet_start, s.quiet_end, s.quiet_disabled,
            (SELECT COUNT(*)::int FROM push_subscriptions p WHERE p.subscriber_id = s.id) AS push_count
       FROM subscribers s
       JOIN subscriptions sub ON sub.subscriber_id = s.id
      WHERE sub.source_id = $1 AND s.confirmed = true AND sub.muted = false AND ${paramsCond}`,
    args
  );
  return rows;
}

// Aiguillage par abonné : envoi immédiat OU mise en file de veille (deferred),
// email et push traités séparément mais selon la MÊME plage de veille de l'abonné.
async function dispatchAlert(sourceId, params, info) {
  let subs;
  try { subs = await loadSubscribersForAlert(sourceId, params); }
  catch (err) { console.error(`[poller] ${sourceId} : lecture abonnés échouée :`, err.message); return; }

  const payload = { name: info.name, message: info.message, url: info.url, statusUrl: info.statusUrl };
  const paramsJson = params ? JSON.stringify(params) : null;
  const immediateEmails = [];
  const immediatePush = [];
  const toDefer = [];

  for (const s of subs) {
    const wantsEmail = s.email_enabled !== false;
    const wantsPush = (s.push_count || 0) > 0;
    if (!wantsEmail && !wantsPush) continue;
    if (isQuietNow(s)) {
      if (wantsEmail) toDefer.push([s.id, sourceId, paramsJson, 'email', JSON.stringify(payload)]);
      if (wantsPush) toDefer.push([s.id, sourceId, paramsJson, 'push', JSON.stringify(payload)]);
    } else {
      if (wantsEmail) immediateEmails.push({ email: s.email, token: s.token });
      if (wantsPush) immediatePush.push(s.id);
    }
  }

  let email = { sent: 0, failed: 0 };
  if (immediateEmails.length) {
    try { email = await sendPromoAlert(immediateEmails, info); }
    catch (err) { console.error(`[poller] ${sourceId} email :`, err.message); }
  }
  let pushSent = 0;
  for (const id of immediatePush) {
    try { const r = await sendToSubscriber(id, info); pushSent += r.sent; }
    catch (err) { console.error(`[poller] ${sourceId} push #${id} :`, err.message); }
  }
  let deferred = 0;
  for (const v of toDefer) {
    try {
      await pool.query(
        'INSERT INTO deferred_notifications (subscriber_id, source_id, params, kind, payload) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)',
        v
      );
      deferred += 1;
    } catch (err) { console.error('[poller] insert différé :', err.message); }
  }

  console.log(
    `[poller] Alerte ${sourceId}${paramsJson ? ' ' + paramsJson : ''} : ` +
    `email ${email.sent} · push ${pushSent} · différées ${deferred}`
  );
}

async function notifySourceSubscribers(sourceId, result = {}) {
  let name = sourceId;
  try {
    const { rows } = await pool.query('SELECT name FROM sources WHERE id = $1', [sourceId]);
    if (rows[0]) name = rows[0].name;
  } catch (err) { /* nom de repli = id */ }

  await dispatchAlert(sourceId, null, {
    id: sourceId,
    name,
    message: result.message || null,
    url: result.url || null,
    statusUrl: `https://labonnealerte.fr/source/${sourceId}/statut`,
  });
}

async function getState(sourceId) {
  const { rows } = await pool.query(
    'SELECT state FROM source_states WHERE source_id = $1',
    [sourceId]
  );
  return rows[0] ? rows[0].state : null;
}

// `since` actuellement stocké pour une source (Date) ou null.
async function getStoredSince(sourceId) {
  const { rows } = await pool.query(
    'SELECT since FROM source_states WHERE source_id = $1',
    [sourceId]
  );
  return rows[0] && rows[0].since ? new Date(rows[0].since) : null;
}

// Seuil « nouvel épisode » : le since doit avancer d'au moins 24h pour qu'on
// re-notifie. Évite toute re-notification sur un flottement de l'API.
const EPISODE_THRESHOLD_MS = 24 * 3600 * 1000;

async function writeState(sourceId, state, fields = {}) {
  const { since = null, until = null, message = null, url = null } = fields;
  await pool.query(
    `UPDATE source_states
        SET state = $1, since = $2, until_date = $3, message = $4, url = $5, checked_at = NOW()
      WHERE source_id = $6`,
    [state, since, until, message, url, sourceId]
  );
}

// Clé mensuelle 'YYYYMM' pour les compteurs.
function monthKey() {
  const d = new Date();
  return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
}

async function incCounter(key, by = 1) {
  try {
    await pool.query(
      `INSERT INTO counters (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = counters.value + EXCLUDED.value`,
      [key, by]
    );
  } catch (err) {
    console.error('[poller] incCounter :', err.message);
  }
}

async function logEvent(sourceId, event, message = null) {
  try {
    await pool.query(
      'INSERT INTO source_events (source_id, event, message) VALUES ($1, $2, $3)',
      [sourceId, event, message]
    );
  } catch (err) {
    console.error('[poller] logEvent :', err.message);
  }
}

// Un seul 'failed' par source et par heure (déduplication).
async function logFailedDedup(sourceId, message) {
  try {
    const { rows } = await pool.query(
      `SELECT event, created_at FROM source_events
        WHERE source_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sourceId]
    );
    const last = rows[0];
    if (last && last.event === 'failed' && (Date.now() - new Date(last.created_at).getTime()) < 3600_000) {
      return; // déjà un 'failed' il y a moins d'une heure
    }
    await logEvent(sourceId, 'failed', message);
  } catch (err) {
    console.error('[poller] logFailedDedup :', err.message);
  }
}

// ── Logique de transition FACTORISÉE ────────────────────────────────────────
// Décision pure inactive→pending→active (et retour) à partir de l'état courant
// et du résultat instantané. Partagée entre le chemin broadcast (source_states)
// et le chemin paramétré (source_param_states) — une seule vérité.
// `requiresConfirmation` : true = confirmation sur 2 cycles (scraper) ;
// false = inactive→active directe + notification immédiate (API officielle).
function decideTransition(current, requiresConfirmation, result, storedSince) {
  if (result.state === 'active') {
    if (current === 'inactive') {
      return requiresConfirmation
        ? { newState: 'pending', event: null, notify: false, write: true, kind: 'pending' }
        : { newState: 'active', event: 'activated', notify: true, write: true, kind: 'immediate' };
    }
    if (current === 'pending') {
      return { newState: 'active', event: 'activated', notify: true, write: true, kind: 'confirmed' };
    }
    // déjà active : « nouvel épisode » si le since avance d'au moins 24h.
    const newSince = result.since ? new Date(result.since) : null;
    const isNewEpisode = newSince && storedSince &&
      (newSince.getTime() - storedSince.getTime()) >= EPISODE_THRESHOLD_MS;
    return isNewEpisode
      ? { newState: 'active', event: 'activated', notify: true, write: true, kind: 'episode' }
      : { newState: 'active', event: null, notify: false, write: true, kind: 'refresh' };
  }
  if (current === 'active' || current === 'pending') {
    return { newState: 'inactive', event: 'deactivated', notify: false, write: true, kind: 'deactivated' };
  }
  return { newState: 'inactive', event: null, notify: false, write: false, kind: 'still-inactive' };
}

const KIND_LOG = {
  immediate: (l) => `ALERTE IMMÉDIATE [${l}] (sans confirmation)`,
  pending: (l) => `${l} : inactive → PENDING`,
  confirmed: (l) => `ALERTE CONFIRMÉE [${l}]`,
  episode: (l) => `NOUVEL ÉPISODE [${l}]`,
  refresh: (l) => `${l} : déjà active.`,
  deactivated: (l) => `${l} : → INACTIVE`,
  'still-inactive': (l) => `${l} : toujours inactive.`,
};

// Applique une décision de transition via un « store » abstrait (broadcast ou
// paramétré). store : { getState, getStoredSince, writeState, logEvent, notify }.
async function applyResult(store, label, result, requiresConfirmation) {
  const current = await store.getState();
  if (current === null) {
    console.error(`[poller] ${label} : aucune ligne d'état (migration ?).`);
    return;
  }
  const storedSince = (result.state === 'active' && current === 'active')
    ? await store.getStoredSince() : null;
  const d = decideTransition(current, requiresConfirmation, result, storedSince);

  if (d.write) {
    const fields = result.state === 'active'
      ? { since: result.since, until: result.until, message: result.message, url: result.url }
      : {};
    await store.writeState(d.newState, fields);
  }
  if (d.event) await store.logEvent(d.event, d.event === 'deactivated' ? null : result.message);
  console.log('[poller] ' + KIND_LOG[d.kind](label));
  if (d.notify) {
    try { await store.notify(result); }
    catch (err) { console.error(`[poller] ${label} : échec envoi alertes :`, err.message); }
  }
}

// ── Persistance opt-in des références anti-rétroactives ──────────────────────
// Contrat FACULTATIF d'une source (broadcast OU paramétrée). Si le module exporte
// LES DEUX fonctions, le poller charge sa référence depuis la base AVANT le check et
// la re-sauve APRÈS, comblant le trou du redéploiement (un item apparu pendant l'arrêt
// est détecté au retour, jamais inventé) :
//   loadRef(params?, data) : hydrate la référence en mémoire (params absent = broadcast ;
//                            data = objet JSONB relu, ou null = amorçage classique).
//   dumpRef(params?)       : renvoie la structure sérialisable courante, ou `undefined`
//                            si INCHANGÉE depuis le dernier load/dump (→ aucune écriture).
// GARDE-FOUS (obligatoires) : toute erreur DB (colonne absente, timeout, JSON invalide)
// est avalée → log discret + comportement mémoire-seule (amorçage). On n'écrit jamais
// une référence > 256 Ko (ceinture ; le plafond métier 64 Ko est appliqué côté dumpRef).
// Rien de tout ceci ne touche decideTransition/applyResult (machine à états inchangée).
const REF_MAX_BYTES = 256 * 1024;

function sourceHasRef(source) {
  return source && typeof source.loadRef === 'function' && typeof source.dumpRef === 'function';
}

// Lit la colonne ref (JSONB → objet JS) ; null si absente/erreur (dégradation silencieuse).
async function loadPersistedRef(table, sourceId, params) {
  try {
    const q = params
      ? `SELECT ref FROM ${table} WHERE source_id = $1 AND params = $2::jsonb`
      : `SELECT ref FROM ${table} WHERE source_id = $1`;
    const args = params ? [sourceId, JSON.stringify(params)] : [sourceId];
    const { rows } = await pool.query(q, args);
    return rows[0] ? rows[0].ref : null;
  } catch (err) {
    console.warn(`[poller] ${sourceId} : lecture ref ignorée (${err.message}).`);
    return null;
  }
}

// Upsert de la colonne ref, INDÉPENDANT des transitions d'état (la ligne est créée
// dès l'amorçage, même en still-inactive). N'écrit que si la référence a changé et
// reste sous le plafond. Ne touche QUE la colonne ref (les autres colonnes gardent
// leur défaut à l'INSERT, ou sont préservées au CONFLICT).
async function savePersistedRef(table, sourceId, params, ref, prevJson) {
  if (ref === undefined) return; // module : référence inchangée
  let json;
  try { json = JSON.stringify(ref); } catch { return; }
  if (json == null) return;
  if (Buffer.byteLength(json, 'utf8') > REF_MAX_BYTES) {
    console.warn(`[poller] ${sourceId} : ref > 256 Ko, non écrite.`);
    return;
  }
  if (json === prevJson) return; // pas de changement → pas d'écriture
  try {
    if (params) {
      await pool.query(
        `INSERT INTO source_param_states (source_id, params, ref) VALUES ($1, $2::jsonb, $3::jsonb)
         ON CONFLICT (source_id, params) DO UPDATE SET ref = EXCLUDED.ref`,
        [sourceId, JSON.stringify(params), json]
      );
    } else {
      await pool.query(
        `INSERT INTO source_states (source_id, ref) VALUES ($1, $2::jsonb)
         ON CONFLICT (source_id) DO UPDATE SET ref = EXCLUDED.ref`,
        [sourceId, json]
      );
    }
  } catch (err) {
    console.warn(`[poller] ${sourceId} : écriture ref ignorée (${err.message}).`);
  }
}

// ── Chemin BROADCAST (v1 ; +persistance opt-in de la référence) ──────────────
async function processSource(source, requiresConfirmation = true) {
  // Hydratation AVANT le check (une seule fois) si la source gère une référence.
  let prevRefJson = null;
  const withRef = sourceHasRef(source);
  if (withRef) {
    const stored = await loadPersistedRef('source_states', source.id, null);
    prevRefJson = stored != null ? JSON.stringify(stored) : null;
    try { source.loadRef(undefined, stored); }
    catch (err) { console.warn(`[poller] ${source.id} : loadRef ignoré (${err.message}).`); }
  }

  let result;
  try {
    result = await source.check();
    console.log(`[poller] ${source.id} → check state=${result.state}`);
    await incCounter('checks_total');
    await incCounter('checks_' + monthKey());
  } catch (err) {
    console.error(`[poller] ${source.id} : échec du check :`, err.message);
    await logFailedDedup(source.id, err.message);
    return;
  }

  const store = {
    getState: () => getState(source.id),
    getStoredSince: () => getStoredSince(source.id),
    writeState: (state, fields) => writeState(source.id, state, fields),
    logEvent: (event, message) => logEvent(source.id, event, message),
    notify: (res) => notifySourceSubscribers(source.id, res),
  };
  await applyResult(store, source.id, result, requiresConfirmation);

  // Persistance de la référence APRÈS le check (upsert conditionnel, indépendant de l'état).
  if (withRef) {
    let ref;
    try { ref = source.dumpRef(undefined); }
    catch (err) { console.warn(`[poller] ${source.id} : dumpRef ignoré (${err.message}).`); ref = undefined; }
    await savePersistedRef('source_states', source.id, null, ref, prevRefJson);
  }
}

// ── Chemin PARAMÉTRÉ (v2) — état par combinaison, mêmes transitions ──────────
async function getParamState(sourceId, params) {
  const { rows } = await pool.query(
    'SELECT state FROM source_param_states WHERE source_id = $1 AND params = $2::jsonb',
    [sourceId, JSON.stringify(params)]
  );
  return rows[0] ? rows[0].state : 'inactive'; // pas de ligne = combinaison jamais activée
}

async function getParamStoredSince(sourceId, params) {
  const { rows } = await pool.query(
    'SELECT since FROM source_param_states WHERE source_id = $1 AND params = $2::jsonb',
    [sourceId, JSON.stringify(params)]
  );
  return rows[0] && rows[0].since ? new Date(rows[0].since) : null;
}

async function writeParamState(sourceId, params, state, fields = {}) {
  const { since = null, until = null, message = null, url = null } = fields;
  await pool.query(
    `INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (source_id, params) DO UPDATE
       SET state = EXCLUDED.state, since = EXCLUDED.since, until_date = EXCLUDED.until_date,
           message = EXCLUDED.message, url = EXCLUDED.url, checked_at = NOW()`,
    [sourceId, JSON.stringify(params), state, since, until, message, url]
  );
}

async function logParamEvent(sourceId, params, event, message = null) {
  try {
    await pool.query(
      'INSERT INTO source_events (source_id, event, message, params) VALUES ($1, $2, $3, $4::jsonb)',
      [sourceId, event, message, JSON.stringify(params)]
    );
  } catch (err) {
    console.error('[poller] logParamEvent :', err.message);
  }
}

async function confirmedEmailsForSourceParams(sourceId, params) {
  const { rows } = await pool.query(
    `SELECT s.email, s.token
       FROM subscribers s
       JOIN subscriptions sub ON sub.subscriber_id = s.id
      WHERE sub.source_id = $1 AND sub.params = $2::jsonb
        AND s.confirmed = true AND s.email_enabled = true AND sub.muted = false`,
    [sourceId, JSON.stringify(params)]
  );
  return rows.map((r) => ({ email: r.email, token: r.token }));
}

async function notifyParamSubscribers(sourceId, params, result = {}) {
  let name = sourceId;
  let schema = null;
  try {
    const { rows } = await pool.query('SELECT name, params_schema FROM sources WHERE id = $1', [sourceId]);
    if (rows[0]) { name = rows[0].name; schema = rows[0].params_schema || null; }
  } catch (err) { /* repli = id */ }

  // Libellé résolu via le schéma (ex. « Vigilance météo — Hautes-Alpes »).
  const value = resolveLabel(schema, params) || Object.values(params || {}).join(', ');
  const resolved = value ? `${name} — ${value}` : name;

  const qs = Object.keys(params || {})
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');

  await dispatchAlert(sourceId, params, {
    id: sourceId,
    name: resolved,
    message: result.message || null,
    url: result.url || null,
    statusUrl: `https://labonnealerte.fr/source/${sourceId}/statut${qs ? '?' + qs : ''}`,
  });
}

// Collecte les combinaisons EFFECTIVEMENT souscrites, appelle checkWithParams
// (un seul appel réseau côté factory), écrit un état par combinaison.
async function processParamSource(source, requiresConfirmation = true) {
  let combos;
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT params FROM subscriptions WHERE source_id = $1 AND params IS NOT NULL',
      [source.id]
    );
    combos = rows.map((r) => r.params); // pg renvoie déjà des objets JS
  } catch (err) {
    console.error(`[poller] ${source.id} : lecture des combinaisons échouée :`, err.message);
    return;
  }
  if (combos.length === 0) {
    console.log(`[poller] ${source.id} : 0 combinaison souscrite — aucun appel.`);
    return;
  }

  // Persistance opt-in : hydratation AVANT le check (une seule requête pour toutes les
  // combos, une seule fois par cycle). prevRefJson mémorise le snapshot chargé par combo.
  const withRef = sourceHasRef(source);
  const prevRefJson = new Map(); // JSON.stringify(params) → json chargé (ou null)
  if (withRef) {
    let refByKey = new Map();
    try {
      const { rows } = await pool.query('SELECT params, ref FROM source_param_states WHERE source_id = $1', [source.id]);
      refByKey = new Map(rows.map((r) => [JSON.stringify(r.params), r.ref]));
    } catch (err) {
      console.warn(`[poller] ${source.id} : lecture refs ignorée (${err.message}).`);
    }
    for (const params of combos) {
      const key = JSON.stringify(params);
      const stored = refByKey.has(key) ? refByKey.get(key) : null;
      prevRefJson.set(key, stored != null ? JSON.stringify(stored) : null);
      try { source.loadRef(params, stored); }
      catch (err) { console.warn(`[poller] ${source.id} ${key} : loadRef ignoré (${err.message}).`); }
    }
  }

  let results;
  try {
    results = await source.checkWithParams(combos);
    console.log(`[poller] ${source.id} → checkWithParams (${combos.length} combinaison(s))`);
    await incCounter('checks_total');
    await incCounter('checks_' + monthKey());
  } catch (err) {
    console.error(`[poller] ${source.id} : échec checkWithParams :`, err.message);
    await logFailedDedup(source.id, err.message);
    return;
  }

  for (const res of (results || [])) {
    const params = res.params || {};
    const label = `${source.id} ${JSON.stringify(params)}`;
    const store = {
      getState: () => getParamState(source.id, params),
      getStoredSince: () => getParamStoredSince(source.id, params),
      writeState: (state, fields) => writeParamState(source.id, params, state, fields),
      logEvent: (event, message) => logParamEvent(source.id, params, event, message),
      notify: (r) => notifyParamSubscribers(source.id, params, r),
    };
    try {
      await applyResult(store, label, res, requiresConfirmation);
    } catch (err) {
      console.error(`[poller] ${label} : erreur transition :`, err.message);
    }
    // Persistance de la référence APRÈS applyResult (upsert conditionnel, indépendant de l'état).
    if (withRef) {
      let ref;
      try { ref = source.dumpRef(params); }
      catch (err) { console.warn(`[poller] ${label} : dumpRef ignoré (${err.message}).`); ref = undefined; }
      await savePersistedRef('source_param_states', source.id, params, ref, prevRefJson.get(JSON.stringify(params)));
    }
  }
}

// État courant d'une source/combinaison (pour l'obsolescence au flush). En cas
// d'erreur DB, on considère l'alerte encore active (ne pas marquer obsolète à tort).
async function currentStateOf(sourceId, params) {
  try {
    if (params) {
      const { rows } = await pool.query(
        'SELECT state FROM source_param_states WHERE source_id = $1 AND params = $2::jsonb',
        [sourceId, JSON.stringify(params)]);
      return rows[0] ? rows[0].state : 'inactive';
    }
    const { rows } = await pool.query('SELECT state FROM source_states WHERE source_id = $1', [sourceId]);
    return rows[0] ? rows[0].state : 'inactive';
  } catch (err) { return 'active'; }
}

// Flush d'un abonné sorti de sa plage de veille : UN digest email + push (récap si
// > 2). Les alertes redevenues inactives sont marquées « terminée entre-temps ».
async function flushSubscriber(subscriberId) {
  const subRes = await pool.query(
    'SELECT id, email, token, email_enabled, quiet_start, quiet_end, quiet_disabled FROM subscribers WHERE id = $1',
    [subscriberId]);
  const sub = subRes.rows[0];
  if (!sub) { await pool.query('DELETE FROM deferred_notifications WHERE subscriber_id = $1', [subscriberId]); return; }
  if (isQuietNow(sub)) return; // encore en veille : on attend la sortie de plage

  const { rows } = await pool.query(
    'SELECT id, source_id, params, kind, payload FROM deferred_notifications WHERE subscriber_id = $1 ORDER BY created_at ASC',
    [subscriberId]);
  if (rows.length === 0) return;

  const stateCache = new Map();
  async function isObsolete(r) {
    const key = r.source_id + '|' + JSON.stringify(r.params || null);
    if (!stateCache.has(key)) stateCache.set(key, await currentStateOf(r.source_id, r.params || null));
    return stateCache.get(key) !== 'active';
  }

  const emailItems = [];
  const pushItems = [];
  for (const r of rows) {
    const p = r.payload || {};
    const item = { name: p.name, message: p.message, url: p.url, statusUrl: p.statusUrl, obsolete: await isObsolete(r) };
    if (r.kind === 'email') emailItems.push(item);
    else if (r.kind === 'push') pushItems.push(item);
  }

  if (emailItems.length && sub.email_enabled !== false) {
    try { await sendDeferredDigest({ email: sub.email, token: sub.token }, emailItems); }
    catch (err) { console.error(`[poller] flush digest email #${subscriberId} :`, err.message); }
  }

  if (pushItems.length) {
    try {
      if (pushItems.length <= 2) {
        const live = pushItems.filter((it) => !it.obsolete);
        for (const it of live) await sendToSubscriber(subscriberId, it);
        if (live.length === 0) {
          await sendToSubscriber(subscriberId, { name: 'La Bonne Alerte', message: `${pushItems.length} alerte(s) terminée(s) pendant votre veille` });
        }
      } else {
        await sendToSubscriber(subscriberId, {
          name: 'La Bonne Alerte',
          message: `${pushItems.length} alertes pendant votre veille`,
          url: 'https://labonnealerte.fr/connexion',
        });
      }
    } catch (err) { console.error(`[poller] flush push #${subscriberId} :`, err.message); }
  }

  await pool.query('DELETE FROM deferred_notifications WHERE subscriber_id = $1', [subscriberId]);
  console.log(`[poller] Veille : flush abonné #${subscriberId} (${emailItems.length} email, ${pushItems.length} push).`);
}

// Parcourt les abonnés ayant des différés en attente et flush ceux sortis de veille.
async function flushDeferredNotifications() {
  let ids;
  try {
    const { rows } = await pool.query('SELECT DISTINCT subscriber_id FROM deferred_notifications');
    ids = rows.map((r) => r.subscriber_id);
  } catch (err) { console.error('[poller] flush : lecture des différés échouée :', err.message); return; }
  for (const sid of ids) {
    try { await flushSubscriber(sid); }
    catch (err) { console.error(`[poller] flush abonné #${sid} :`, err.message); }
  }
}

async function runCycle() {
  console.log(`\n[poller] ── Cycle ${new Date().toISOString()} ──`);

  // Purge des sessions expirées au plus une fois par jour.
  if (Date.now() - lastSessionCleanup > 24 * 3600 * 1000) {
    lastSessionCleanup = Date.now();
    await cleanupExpired();
  }

  let enabledIds;
  let confirmFlags; // id -> requires_confirmation
  let paramIds;     // ids dont params_schema est non NULL → chemin paramétré
  try {
    // Les sources 'linked' (services partenaires externes) n'ont pas de check :
    // elles sont configurées sur leur propre site, donc hors du cycle du poller.
    const { rows } = await pool.query(
      "SELECT id, requires_confirmation, params_schema FROM sources WHERE enabled = true AND type <> 'linked'"
    );
    enabledIds = new Set(rows.map((r) => r.id));
    confirmFlags = new Map(rows.map((r) => [r.id, r.requires_confirmation]));
    paramIds = new Set(rows.filter((r) => r.params_schema != null).map((r) => r.id));
  } catch (err) {
    console.error('[poller] DB indisponible — cycle ignoré :', err.message);
    return;
  }

  const active = SOURCES.filter((s) => enabledIds.has(s.id));
  if (active.length === 0) {
    console.log('[poller] Aucune source activée à interroger.');
    return;
  }

  for (const source of active) {
    try {
      // Défaut prudent à true si le flag est absent (colonne pas encore migrée).
      const requires = confirmFlags.get(source.id) === false ? false : true;
      // Source paramétrée : schéma déclaré en base ET module exposant checkWithParams.
      if (paramIds.has(source.id) && typeof source.checkWithParams === 'function') {
        await processParamSource(source, requires);
      } else if (typeof source.check === 'function') {
        await processSource(source, requires); // broadcast (chemin v1 inchangé)
      } else {
        console.warn(`[poller] ${source.id} : ni check() ni params_schema+checkWithParams — ignorée.`);
      }
    } catch (err) {
      console.error(`[poller] ${source.id} : erreur inattendue :`, err.message);
    }
  }

  // Sources EXTERNES (type 'external', endpoint_url) : pas de fichier, construites à
  // la volée. Broadcast ou paramétrées, mêmes transitions que les internes.
  let externals = [];
  try {
    const { rows } = await pool.query(
      "SELECT id, endpoint_url, params_schema, requires_confirmation " +
      "FROM sources WHERE enabled = true AND type = 'external' AND endpoint_url IS NOT NULL"
    );
    externals = rows;
  } catch (err) {
    console.error('[poller] lecture des sources externes échouée :', err.message);
  }
  for (const row of externals) {
    const src = buildExternalSource(row);
    if (!src) continue;
    const requires = row.requires_confirmation === false ? false : true;
    try {
      // DoomName : garantir que chaque domaine suivi est bien tracké côté DoomName
      // (idempotent, best-effort) — rattrape les échecs du moment de l'abonnement.
      if (row.id === 'doomname' && row.params_schema != null) {
        try {
          const { rows: cs } = await pool.query(
            "SELECT DISTINCT params FROM subscriptions WHERE source_id = 'doomname' AND params IS NOT NULL"
          );
          for (const c of cs) {
            const dom = c.params && c.params.domaine;
            if (dom) await trackDomain(dom);
          }
        } catch (e) { console.error('[poller] doomname track :', e.message); }
      }
      if (row.params_schema != null) {
        await processParamSource(src, requires);
      } else {
        // Le chemin broadcast fait un UPDATE : garantir la ligne d'état (idempotent).
        await pool.query(
          'INSERT INTO source_states (source_id) VALUES ($1) ON CONFLICT (source_id) DO NOTHING',
          [row.id]
        );
        await processSource(src, requires);
      }
    } catch (err) {
      console.error(`[poller] ${row.id} (externe) : erreur inattendue :`, err.message);
    }
  }

  // Heures de veille : envoie les notifications différées aux abonnés sortis de
  // leur plage silencieuse (après le traitement des sources → états à jour pour
  // le calcul d'obsolescence du digest).
  await flushDeferredNotifications();
}

function startPoller() {
  console.log(
    `[poller] ${SOURCES.length} source(s) chargée(s) : ${SOURCES.map((s) => s.id).join(', ') || '—'}`
  );
  console.log(`[poller] Planification active : "${SCHEDULE}" (toutes les 30 min)`);
  // Premier passage immédiat pour voir le comportement sans attendre 30 min.
  runCycle();
  cron.schedule(SCHEDULE, runCycle);

  // ── EXCEPTION ASSUMÉE (ne PAS copier ailleurs sans réflexion) ───────────────
  // Sonde d'OBSERVATION leboncoin-livraison : cron DÉDIÉ à cadence fine (3 min),
  // le seul du projet en dehors du cron global de 30 min. Justification : la
  // latence de détection est le cœur de la valeur de cette alerte (promo qui
  // démarre le vendredi vers 14h). node-cron avec timezone Europe/Paris déclenche
  // pendant 13h-15h le vendredi ; runProbe() re-vérifie la fenêtre exacte
  // 13:58-15:00 (Paris) et sort sans requête réseau en dehors. MODE LOG UNIQUEMENT :
  // écrit dans promo_probe_log, n'envoie AUCUNE alerte (cf. leboncoin-promo-probe.js).
  cron.schedule('*/3 13-15 * * 5', () => {
    runProbe(pool).catch((err) => console.error('[promo-probe] runProbe :', err.message));
  }, { timezone: 'Europe/Paris' });
  console.log('[poller] Sonde observation leboncoin-livraison : cron dédié "*/3 13-15 * * 5" (Europe/Paris), fenêtre effective vendredi 13:58-15:00.');
}

// processSource/processParamSource/decideTransition exposés pour le banc d'essai.
module.exports = {
  startPoller, runCycle, processSource, processParamSource, decideTransition,
  dispatchAlert, flushDeferredNotifications, flushSubscriber,
};
