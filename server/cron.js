const cron = require('node-cron');
const { checkPromo } = require('./scraper');
const { pool } = require('./db');
const { sendPromoAlert } = require('./mailer');

async function notifyConfirmedSubscribers() {
  const { rows } = await pool.query(
    'SELECT email FROM subscribers WHERE confirmed = true'
  );
  const emails = rows.map((r) => r.email);

  if (emails.length === 0) {
    console.log('[cron] Aucun abonné confirmé à prévenir.');
    return;
  }

  console.log(`[cron] Envoi de l'alerte promo à ${emails.length} abonné(s)...`);
  const { sent, failed } = await sendPromoAlert(emails);
  console.log(`[cron] Alerte envoyée : ${sent} OK, ${failed} échec(s).`);
}

// Toutes les 30 minutes
const SCHEDULE = '*/30 * * * *';

async function getCurrentStatus() {
  const { rows } = await pool.query(
    'SELECT id, active, pending FROM promo_status ORDER BY id DESC LIMIT 1'
  );
  return rows[0] || null;
}

async function updateStatus(id, fields) {
  const { active, pending, date_debut, date_fin } = fields;
  await pool.query(
    `UPDATE promo_status
       SET active = $1, pending = $2, date_debut = $3, date_fin = $4, updated_at = NOW()
     WHERE id = $5`,
    [active, pending, date_debut ?? null, date_fin ?? null, id]
  );
}

async function runCycle() {
  const stamp = new Date().toISOString();
  console.log(`\n[cron] ── Cycle ${stamp} ──`);

  let result;
  try {
    result = await checkPromo();
    console.log(
      `[cron] Scrape OK → found=${result.found}` +
        (result.found
          ? ` debut=${result.date_debut ?? '?'} fin=${result.date_fin ?? '?'}`
          : '')
    );
  } catch (err) {
    console.error('[cron] Échec du scraping :', err.message);
    return;
  }

  let current;
  try {
    current = await getCurrentStatus();
  } catch (err) {
    console.error(
      '[cron] DB indisponible — impossible de lire le statut, cycle ignoré :',
      err.message
    );
    return;
  }

  if (!current) {
    console.error('[cron] Aucune ligne promo_status en base — as-tu lancé init.sql ?');
    return;
  }

  const state = current.active ? 'active' : current.pending ? 'pending' : 'inactive';
  console.log(`[cron] État actuel : ${state}`);

  try {
    if (result.found) {
      if (state === 'inactive') {
        await updateStatus(current.id, {
          active: false,
          pending: true,
          date_debut: result.date_debut,
          date_fin: result.date_fin,
        });
        console.log('[cron] inactive → PENDING (en attente de confirmation)');
      } else if (state === 'pending') {
        await updateStatus(current.id, {
          active: true,
          pending: false,
          date_debut: result.date_debut,
          date_fin: result.date_fin,
        });
        console.log('[cron] pending → ACTIVE ✅ PROMO CONFIRMÉE');
        try {
          await notifyConfirmedSubscribers();
        } catch (err) {
          console.error('[cron] Échec envoi des alertes promo :', err.message);
        }
      } else {
        console.log('[cron] Déjà active, rien à faire.');
      }
    } else {
      if (state === 'active' || state === 'pending') {
        await updateStatus(current.id, {
          active: false,
          pending: false,
          date_debut: null,
          date_fin: null,
        });
        console.log(`[cron] ${state} → INACTIVE (promo disparue)`);
      } else {
        console.log('[cron] Toujours inactive, rien à faire.');
      }
    }
  } catch (err) {
    console.error('[cron] Échec de mise à jour DB :', err.message);
  }
}

function startCron() {
  console.log(`[cron] Planification active : "${SCHEDULE}" (toutes les 30 min)`);
  // Un premier passage immédiat pour voir le comportement sans attendre 30 min.
  runCycle();
  cron.schedule(SCHEDULE, runCycle);
}

module.exports = { startCron, runCycle };
