const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { pool } = require('./db');
const { sendPromoAlert } = require('./mailer');

// Toutes les 30 minutes
const SCHEDULE = '*/30 * * * *';

// Charge dynamiquement tous les modules de server/sources/.
// Chaque module exporte { id, check() }.
function loadSources() {
  const dir = path.join(__dirname, 'sources');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(dir, f)))
    .filter((mod) => mod && mod.id && typeof mod.check === 'function');
}

const SOURCES = loadSources();

// Emails des abonnés confirmés inscrits à CETTE source (jointure subscriptions).
async function confirmedEmailsForSource(sourceId) {
  const { rows } = await pool.query(
    `SELECT s.email
       FROM subscribers s
       JOIN subscriptions sub ON sub.subscriber_id = s.id
      WHERE sub.source_id = $1 AND s.confirmed = true`,
    [sourceId]
  );
  return rows.map((r) => r.email);
}

async function notifySourceSubscribers(sourceId, result = {}) {
  const emails = await confirmedEmailsForSource(sourceId);
  if (emails.length === 0) {
    console.log(`[poller] Aucun abonné confirmé pour ${sourceId}.`);
    return;
  }
  let name = sourceId;
  try {
    const { rows } = await pool.query('SELECT name FROM sources WHERE id = $1', [sourceId]);
    if (rows[0]) name = rows[0].name;
  } catch (err) { /* nom de repli = id */ }
  const info = { id: sourceId, name, message: result.message || null, url: result.url || null };
  console.log(`[poller] Envoi de l'alerte à ${emails.length} abonné(s) de ${sourceId}...`);
  const { sent, failed } = await sendPromoAlert(emails, info);
  console.log(`[poller] Alerte ${sourceId} : ${sent} OK, ${failed} échec(s).`);
}

async function getState(sourceId) {
  const { rows } = await pool.query(
    'SELECT state FROM source_states WHERE source_id = $1',
    [sourceId]
  );
  return rows[0] ? rows[0].state : null;
}

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

// Applique la logique de transition inactive→pending→active (et retour inactive)
// pour une source, à partir du résultat instantané de son check().
// `requiresConfirmation` : true = confirmation sur 2 cycles (scraper) ;
// false = transition inactive→active directe avec notification immédiate (API officielle).
async function processSource(source, requiresConfirmation = true) {
  let result;
  try {
    result = await source.check();
    console.log(`[poller] ${source.id} → check state=${result.state}`);
    // Check réussi : compteurs de vérifications (total + mois courant).
    await incCounter('checks_total');
    await incCounter('checks_' + monthKey());
  } catch (err) {
    console.error(`[poller] ${source.id} : échec du check :`, err.message);
    await logFailedDedup(source.id, err.message);
    return;
  }

  const current = await getState(source.id);
  if (current === null) {
    console.error(`[poller] ${source.id} : aucune ligne source_states (migration ?).`);
    return;
  }

  const fields = {
    since: result.since,
    until: result.until,
    message: result.message,
    url: result.url,
  };

  if (result.state === 'active') {
    if (current === 'inactive' && !requiresConfirmation) {
      // Source fiable (API officielle) : activation directe + notification immédiate.
      await writeState(source.id, 'active', fields);
      await logEvent(source.id, 'activated', result.message);
      console.log(`[poller] ALERTE IMMÉDIATE [${source.id}] (sans confirmation)`);
      try {
        await notifySourceSubscribers(source.id, result);
      } catch (err) {
        console.error(`[poller] ${source.id} : échec envoi alertes :`, err.message);
      }
    } else if (current === 'inactive') {
      await writeState(source.id, 'pending', fields);
      console.log(`[poller] ${source.id} : inactive → PENDING`);
    } else if (current === 'pending') {
      await writeState(source.id, 'active', fields);
      await logEvent(source.id, 'activated', result.message);
      console.log(`[poller] ALERTE CONFIRMÉE [${source.id}]`);
      try {
        await notifySourceSubscribers(source.id, result);
      } catch (err) {
        console.error(`[poller] ${source.id} : échec envoi alertes :`, err.message);
      }
    } else {
      // déjà active : on rafraîchit les métadonnées
      await writeState(source.id, 'active', fields);
      console.log(`[poller] ${source.id} : déjà active.`);
    }
  } else {
    if (current === 'active' || current === 'pending') {
      await writeState(source.id, 'inactive', {});
      await logEvent(source.id, 'deactivated', null);
      console.log(`[poller] ${source.id} : ${current} → INACTIVE`);
    } else {
      console.log(`[poller] ${source.id} : toujours inactive.`);
    }
  }
}

async function runCycle() {
  console.log(`\n[poller] ── Cycle ${new Date().toISOString()} ──`);

  let enabledIds;
  let confirmFlags; // id -> requires_confirmation
  try {
    // Les sources 'linked' (services partenaires externes) n'ont pas de check :
    // elles sont configurées sur leur propre site, donc hors du cycle du poller.
    const { rows } = await pool.query(
      "SELECT id, requires_confirmation FROM sources WHERE enabled = true AND type <> 'linked'"
    );
    enabledIds = new Set(rows.map((r) => r.id));
    confirmFlags = new Map(rows.map((r) => [r.id, r.requires_confirmation]));
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
      const requires = confirmFlags.get(source.id);
      await processSource(source, requires === false ? false : true);
    } catch (err) {
      console.error(`[poller] ${source.id} : erreur inattendue :`, err.message);
    }
  }
}

function startPoller() {
  console.log(
    `[poller] ${SOURCES.length} source(s) chargée(s) : ${SOURCES.map((s) => s.id).join(', ') || '—'}`
  );
  console.log(`[poller] Planification active : "${SCHEDULE}" (toutes les 30 min)`);
  // Premier passage immédiat pour voir le comportement sans attendre 30 min.
  runCycle();
  cron.schedule(SCHEDULE, runCycle);
}

module.exports = { startPoller, runCycle };
