// Arrêt propre du serveur (LOT G), extrait et TESTABLE (aucune dépendance au process).
// Sur SIGTERM/SIGINT, index.js appelle le shutdown créé ici : il
//   1) demande au poller de ne plus lancer de nouveau cycle (stopPoller) ;
//   2) ferme le serveur HTTP (arrête d'accepter des connexions) ;
//   3) attend la fin du cycle du poller EN COURS, avec un plafond (20 s par défaut) ;
//   4) ferme le pool PostgreSQL.
// Les horloges (now/sleep) sont injectables pour un test déterministe, sans attente réelle.
'use strict';

function createGracefulShutdown(deps) {
  const {
    server, stopPoller, isCycleRunning, pool,
    maxWaitMs = 20_000, pollMs = 200,
    log = console.log,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = deps || {};
  let started = false;

  return async function shutdown(signal) {
    if (started) return { already: true };   // idempotent : un seul arrêt
    started = true;
    log(`[server] ${signal || 'arrêt'} reçu : arrêt propre…`);

    if (typeof stopPoller === 'function') stopPoller();            // plus de nouveau cycle
    if (server && typeof server.close === 'function') {
      server.close(() => log('[server] serveur HTTP fermé'));
    }

    // Attente bornée de la fin du cycle en cours.
    const deadline = now() + maxWaitMs;
    while (typeof isCycleRunning === 'function' && isCycleRunning() && now() < deadline) {
      await sleep(pollMs);
    }
    const timedOut = typeof isCycleRunning === 'function' && isCycleRunning();
    if (timedOut) log(`[server] cycle poller encore en cours après ${maxWaitMs} ms : on ferme quand même`);

    if (pool && typeof pool.end === 'function') {
      try { await pool.end(); log('[server] pool PostgreSQL fermé'); }
      catch (e) { log('[server] fermeture du pool : ' + (e && e.message)); }
    }
    return { timedOut };
  };
}

module.exports = { createGracefulShutdown };
