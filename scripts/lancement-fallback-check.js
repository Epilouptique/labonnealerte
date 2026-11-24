// scripts/lancement-fallback-check.js — JETABLE (aucune base, aucun poller, aucun appel
// réseau : le fetcher est injecté via opts._fetch). Vérifie la borne d'âge du repli
// (MAX_FALLBACK_AGE_MS = 6 h) de lancement-spatial : un état 'active' périmé n'est plus
// resservi en repli (sinon il stagnerait, decideTransition ne fermant que sur 'inactive').
//
//   node scripts/lancement-fallback-check.js
'use strict';

const lancement = require('../server/sources/lancement-spatial.js');
const ft = require('../server/sources/lib/fail-threshold.js');
const { _test, check } = lancement;

function resetAll() { _test.reset(); ft._test.reset(); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

// Fetcher injecté renvoyant un lancement européen « Go » qui décolle dans 1 h → 'active'.
// mode=list : results[] = { name, net, status.abbrev, lsp_name, location }.
function fakeOk() {
  const net = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    json: async () => ({ results: [
      { name: 'Ariane 6 | Test', net, status: { abbrev: 'Go' }, lsp_name: 'Arianespace', location: 'Guiana Space Centre, French Guiana' },
    ] }),
    ok: true, status: 200, statusText: 'OK',
  };
}
// Fetcher injecté qui échoue (timeout simulé).
async function fakeFail() { throw new Error('Timeout API Launch Library (>25000 ms)'); }
const asFetch = (impl) => async () => impl();

(async () => {
  console.log('TEST borne d\'âge du repli — lancement-spatial (fetcher injecté)');

  // Pré-condition : un fetch réussi met un état 'active' en cache.
  resetAll();
  const r = await check({ _fetch: asFetch(fakeOk) });
  ok(r.state === 'active' && /Lancement/.test(r.message), 'fetch OK → état actif en cache');

  // 1) Repli sur okCache ACTIVE périmé (>6 h) → inactive (pas d'état actif fantôme).
  const cache = _test.peekCache();
  cache.at -= 7 * 60 * 60 * 1000;   // vieillit de 7 h (> 6 h)
  ft._test.reset();                  // série d'échecs vierge (reste sous le seuil)
  const vieux = await check({ _fetch: asFetch(fakeFail) });
  ok(vieux.state === 'inactive', 'repli sur active périmé (>6 h) → inactive');

  // 2) Contre-épreuve : okCache ACTIVE récent (<6 h) EST resservi en repli.
  resetAll();
  await check({ _fetch: asFetch(fakeOk) });
  const cache2 = _test.peekCache();
  const msgAttendu = cache2.result.message;
  cache2.at -= 2 * 60 * 60 * 1000;   // 2 h : encore frais (< 6 h)
  ft._test.reset();
  const frais = await check({ _fetch: asFetch(fakeFail) });
  ok(frais.state === 'active' && frais.message === msgAttendu,
    'repli sur active frais (<6 h) → état actif resservi (tolérance egress préservée)');

  // 3) Sans aucun cache, un échec toléré → inactive (repli par défaut sain).
  resetAll();
  const sansCache = await check({ _fetch: asFetch(fakeFail) });
  ok(sansCache.state === 'inactive', 'échec sans cache → inactive');

  console.log(`\n${pass} OK, ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR test :', e.message, e.stack); process.exit(1); });
