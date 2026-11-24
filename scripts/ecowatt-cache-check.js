// scripts/ecowatt-cache-check.js — JETABLE (aucune base, aucun poller, aucun appel RTE :
// le fetcher réseau est injecté). Vérifie le cache de succès, l'anti-martèlement et le
// seuil d'incident N=3, et que la logique d'alerte reste identique.
//
//   node scripts/ecowatt-cache-check.js
'use strict';

const ecowatt = require('../server/sources/ecowatt.js');
const ft = require('../server/sources/lib/fail-threshold.js');
const { _test, check, extractEcowatt } = ecowatt;

// Remet à zéro les DEUX états : caches ecowatt + compteur d'échecs consécutifs.
function resetAll() { _test.reset(); ft._test.reset(); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

// Payload RTE v5 réaliste : aujourd'hui ORANGE (2), demain vert (1).
function payloadOrange() {
  return { signals: [
    { jour: '2026-11-17T00:00:00+01:00', dvalue: 2, message: 'Coupure possible entre 18h et 20h', values: [] },
    { jour: '2026-11-18T00:00:00+01:00', dvalue: 1, message: 'Pas de coupure prévue', values: [] },
  ] };
}
const err429 = async () => { throw new Error('EcoWatt : appel trop fréquent (HTTP 429), prochain cycle'); };

(async () => {
  console.log('TEST cache/tolérance ecowatt (fetcher injecté)');

  // Contrat d'alerte inchangé.
  const ref = extractEcowatt(payloadOrange());
  ok(ref.state === 'active' && /ORANGE/.test(ref.message) && /Aujourd'hui/.test(ref.message),
    'alerte inchangée : ORANGE (2) déclenche, message attendu');

  // 1) Succès puis 2e appel dans l'heure → cache servi, fetcher NON rappelé.
  resetAll();
  let calls = 0;
  const okFetcher = async () => { calls++; return payloadOrange(); };
  const r1 = await check({ _fetchSignals: okFetcher });
  const r2 = await check({ _fetchSignals: okFetcher });
  ok(calls === 1, '2 appels dans l\'heure → 1 seul appel réseau (cache de succès)');
  ok(JSON.stringify(r1) === JSON.stringify(r2) && r1.message === ref.message,
    'le cache ressert exactement le même résultat (message identique à l\'octet près)');

  // 2) 429 isolé → silencieux (pas d'exception), repli propre.
  resetAll();
  let threw = false, res429;
  try { res429 = await check({ _fetchSignals: err429 }); } catch (e) { threw = true; }
  ok(!threw, '1 × 429 → aucune exception propagée (silencieux)');
  ok(res429 && res429.state === 'inactive', '1 × 429 sans cache → repli inactive propre');

  // 3) 3 × 429 consécutifs → incident propagé (seuil N=3). On vide seulement les caches
  //    ecowatt entre les coups (pour refaire l'appel réseau), SANS toucher au compteur.
  resetAll();
  let caught = null;
  for (let i = 1; i <= 3; i++) {
    try { await check({ _fetchSignals: err429 }); }
    catch (e) { caught = e; }
    _test.reset(); // vide okCache+lastFailAt (le compteur de fail-threshold persiste)
  }
  ok(caught && /3 échecs consécutifs/.test(caught.message),
    '3 × 429 → incident levé exactement au 3e (« 3 échecs consécutifs »)');

  // 4) Après incident, un succès rompt la série et re-remplit le cache.
  resetAll();
  calls = 0;
  const r = await check({ _fetchSignals: okFetcher });
  ok(calls === 1 && r.state === 'active', 'succès après incident → appel réseau + état actif restauré');

  // 5) Borne d'âge du repli (MAX_FALLBACK_AGE_MS = 6 h) : un dernier bon état ACTIVE
  //    vieux de >6 h ne doit PAS être resservi en repli → inactive. On vieillit okCache
  //    artificiellement via peekCache (mutation de .at), puis on force un 429.
  resetAll();
  await check({ _fetchSignals: okFetcher });            // remplit okCache (active)
  const cache = _test.peekCache();
  ok(cache && cache.result.state === 'active', 'pré-condition : okCache contient un état actif');
  cache.at -= 7 * 60 * 60 * 1000;                        // vieillit de 7 h (> 6 h)
  ft._test.reset();                                       // repart d'une série d'échecs vierge
  const vieux = await check({ _fetchSignals: err429 });  // échec → repli borné
  ok(vieux.state === 'inactive',
    'repli sur okCache périmé (>6 h) → inactive, pas d\'état actif fantôme');

  // 6) Contre-épreuve : okCache ACTIVE récent (<6 h) EST bien resservi en repli.
  resetAll();
  await check({ _fetchSignals: okFetcher });
  const cache2 = _test.peekCache();
  cache2.at -= 1 * 60 * 60 * 1000;                        // 1 h : encore frais
  ft._test.reset();
  const frais = await check({ _fetchSignals: err429 });
  ok(frais.state === 'active' && frais.message === ref.message,
    'repli sur okCache frais (<6 h) → état actif resservi (anti-429 préservé)');

  console.log(`\n${pass} OK, ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR test :', e.message, e.stack); process.exit(1); });
