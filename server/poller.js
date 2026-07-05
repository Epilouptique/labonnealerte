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

async function notifySourceSubscribers(sourceId) {
  const emails = await confirmedEmailsForSource(sourceId);
  if (emails.length === 0) {
    console.log(`[poller] Aucun abonné confirmé pour ${sourceId}.`);
    return;
  }
  console.log(`[poller] Envoi de l'alerte à ${emails.length} abonné(s) de ${sourceId}...`);
  const { sent, failed } = await sendPromoAlert(emails);
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

// Applique la logique de transition inactive→pending→active (et retour inactive)
// pour une source, à partir du résultat instantané de son check().
async function processSource(source) {
  let result;
  try {
    result = await source.check();
    console.log(`[poller] ${source.id} → check state=${result.state}`);
  } catch (err) {
    console.error(`[poller] ${source.id} : échec du check :`, err.message);
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
    if (current === 'inactive') {
      await writeState(source.id, 'pending', fields);
      console.log(`[poller] ${source.id} : inactive → PENDING`);
    } else if (current === 'pending') {
      await writeState(source.id, 'active', fields);
      console.log(`[poller] ALERTE CONFIRMÉE [${source.id}]`);
      try {
        await notifySourceSubscribers(source.id);
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
      console.log(`[poller] ${source.id} : ${current} → INACTIVE`);
    } else {
      console.log(`[poller] ${source.id} : toujours inactive.`);
    }
  }
}

async function runCycle() {
  console.log(`\n[poller] ── Cycle ${new Date().toISOString()} ──`);

  let enabledIds;
  try {
    const { rows } = await pool.query('SELECT id FROM sources WHERE enabled = true');
    enabledIds = new Set(rows.map((r) => r.id));
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
      await processSource(source);
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
