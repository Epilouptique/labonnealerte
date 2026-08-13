// Cartes COMMUNAUTAIRES — job de CLÔTURE par expiration (contrairement à
// user-tasks-notify.js, ce job ne notifie personne : il ferme silencieusement
// les instances 'active' dont expires_at est dépassé). L'auteur peut prolonger
// (POST /:id/extend, max 3 fois) avant l'échéance pour éviter cette clôture.

async function runCommunityReportsExpire(pool) {
  let rows;
  try {
    ({ rows } = await pool.query(
      `UPDATE community_reports SET status = 'expired'
        WHERE status = 'active' AND expires_at < NOW()
        RETURNING id`
    ));
  } catch (err) {
    console.error('[community-reports] clôture par expiration échouée :', err.message);
    return;
  }
  if (rows.length) {
    console.log(`[community-reports] ${rows.length} instance(s) close(s) par expiration.`);
  }
}

module.exports = { runCommunityReportsExpire };
