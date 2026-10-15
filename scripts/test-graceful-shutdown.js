// scripts/test-graceful-shutdown.js — LOT G : arrêt propre (server/graceful-shutdown.js).
// Horloge et sommeil injectés → déterministe, aucune attente réelle, aucun réseau/base.
// Lancer : node scripts/test-graceful-shutdown.js
'use strict';
const assert = require('assert');
const { createGracefulShutdown } = require('../server/graceful-shutdown');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

// Fabrique d'un environnement factice : horloge virtuelle (sleep avance l'horloge),
// serveur/poller/pool espionnés. `cycleTicks` = nombre de sondages où le cycle est encore
// « en cours » avant de se terminer (null = ne se termine jamais → doit atteindre le plafond).
function makeEnv({ cycleTicks }) {
  const order = [];
  let clock = 0;
  let polls = 0;
  return {
    order,
    get clock() { return clock; },
    deps: {
      maxWaitMs: 20_000, pollMs: 200,
      log: () => {},
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      stopPoller: () => order.push('stopPoller'),
      server: { close: (cb) => { order.push('server.close'); if (cb) cb(); } },
      isCycleRunning: () => { const running = cycleTicks === null ? true : polls < cycleTicks; polls += 1; return running; },
      pool: { end: async () => { order.push('pool.end'); } },
    },
  };
}

(async () => {
  console.log('TEST arrêt propre (graceful-shutdown)');

  // 1) Cas nominal : le cycle en cours se termine avant le plafond.
  {
    const env = makeEnv({ cycleTicks: 3 });   // encore en cours 3 sondages (600 ms) puis fini
    const shutdown = createGracefulShutdown(env.deps);
    const res = await shutdown('SIGTERM');
    ok(env.order[0] === 'stopPoller', 'stopPoller appelé en premier (plus de nouveau cycle)');
    ok(env.order.indexOf('server.close') !== -1, 'serveur HTTP fermé');
    ok(env.order.indexOf('pool.end') !== -1, 'pool pg fermé');
    ok(env.order.indexOf('server.close') < env.order.indexOf('pool.end'), 'ordre : close serveur AVANT fermeture du pool');
    ok(res.timedOut === false, 'fin du cycle attendue sans dépasser le plafond');
    ok(env.clock < 20_000, `attente bornée au cycle (~600 ms, horloge=${env.clock} ms)`);
  }

  // 2) Cas limite : le cycle ne se termine jamais → on ferme quand même au plafond de 20 s.
  {
    const env = makeEnv({ cycleTicks: null });
    const shutdown = createGracefulShutdown(env.deps);
    const res = await shutdown('SIGTERM');
    ok(res.timedOut === true, 'cycle interminable : signalé timedOut');
    ok(env.clock >= 20_000 && env.clock < 21_000, `attente plafonnée à 20 s (horloge=${env.clock} ms, pas de boucle infinie)`);
    ok(env.order.indexOf('pool.end') !== -1, 'pool fermé malgré le dépassement');
  }

  // 3) Idempotent : un second signal ne relance pas l'arrêt.
  {
    const env = makeEnv({ cycleTicks: 0 });
    const shutdown = createGracefulShutdown(env.deps);
    await shutdown('SIGTERM');
    const before = env.order.length;
    const res2 = await shutdown('SIGINT');
    ok(res2 && res2.already === true, 'second appel : no-op (already)');
    ok(env.order.length === before, 'aucun effet de bord au second appel');
  }

  // 4) Robustesse : pool.end qui échoue ne fait pas planter l'arrêt.
  {
    const env = makeEnv({ cycleTicks: 0 });
    env.deps.pool = { end: async () => { throw new Error('pool déjà fermé'); } };
    const shutdown = createGracefulShutdown(env.deps);
    let threw = false;
    try { await shutdown('SIGTERM'); } catch (e) { threw = true; }
    ok(!threw, 'échec de pool.end avalé (arrêt ne jette pas)');
  }

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
