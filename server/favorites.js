// Helper partagé « abonnement/adoption = favori » (best-effort, idempotent).
// EXTRAIT de routes/collections.js lors de l'archivage decks/skins (fil #9, 12/09/2026)
// pour survivre à cet archivage : routes/subscribe.js et routes/myalerts.js l'utilisent
// dans le flux d'abonnement de BASE (aucun rapport avec les decks). Tout abonnement actif
// (source simple, instance paramétrée) ajoute AUSSI la source à `favorites` (ON CONFLICT
// sur la PK (subscriber_id, source_id)). Le DÉSABONNEMENT ne retire JAMAIS le favori —
// c'est le but : retrouver dans « Ma collection » ce dont on s'est désabonné.
const { pool } = require('./db');

async function addFavorite(subscriberId, sourceId) {
  try {
    await pool.query(
      `INSERT INTO favorites (subscriber_id, source_id) VALUES ($1, $2)
       ON CONFLICT (subscriber_id, source_id) DO NOTHING`,
      [subscriberId, sourceId]);
  } catch (e) { console.error('[favorites] auto-add :', e.message); }
}

module.exports = { addFavorite };
