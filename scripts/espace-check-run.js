// scripts/espace-check-run.js — JETABLE. Exécute le check() RÉEL des deux sources
// spatiales et affiche le résultat + le temps de réponse. Aucune base, aucun poller.
'use strict';
const lancement = require('../server/sources/lancement-spatial.js');
const asteroide = require('../server/sources/asteroide-frole-terre.js');

async function run(name, source) {
  const t0 = Date.now();
  try {
    const r = await source.check();
    console.log(`\n[${name}] ${Date.now() - t0} ms — state=${r.state}`);
    console.log('  message :', r.message || '(aucun — inactive)');
    console.log('  url     :', r.url, '| since :', r.since, '| until :', r.until);
  } catch (e) {
    console.log(`\n[${name}] ${Date.now() - t0} ms — EXCEPTION : ${e.message}`);
  }
}

(async () => {
  await run('lancement-spatial', lancement);
  // 2e appel immédiat : doit être servi par le cache 2h (aucun appel réseau).
  const t0 = Date.now();
  await lancement.check();
  console.log(`[lancement-spatial] 2e appel : ${Date.now() - t0} ms (attendu ~0, cache)`);
  await run('asteroide-frole-terre', asteroide);
})();
