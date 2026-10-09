// scripts/test-fail-threshold.js — TEST du mécanisme "propager après N échecs consécutifs"
// (server/sources/lib/fail-threshold.js). Hors ligne, aucune base, aucun réseau.
// Lancer : node scripts/test-fail-threshold.js
'use strict';
const assert = require('assert');
const { withFailThreshold, _test } = require('../server/sources/lib/fail-threshold');

let passed = 0;
function test(name, fn) {
  Promise.resolve().then(fn)
    .then(() => { passed++; console.log('  ✓ ' + name); })
    .catch((e) => { console.error('  ✗ ' + name + '\n    ' + (e.message || e)); process.exitCode = 1; });
}

(async () => {
  console.log('TEST fail-threshold (propager après N échecs consécutifs)');

  // --- seuil 3 : 2 échecs tolérés (repli inactive), le 3e propage ---
  _test.reset();
  {
    let mode = 'fail';
    const check = withFailThreshold('demo', async () => {
      if (mode === 'fail') throw new Error('403 anti-bot');
      return { state: 'active' };
    }, { threshold: 3 });

    const r1 = await check();
    const r2 = await check();
    test('échec 1/3 : avalé → repli inactive', () => assert.strictEqual(r1.state, 'inactive'));
    test('échec 2/3 : avalé → repli inactive', () => assert.strictEqual(r2.state, 'inactive'));
    let threw = false;
    try { await check(); } catch (e) { threw = true; assert.ok(/3 échecs consécutifs/.test(e.message)); }
    test('échec 3/3 : PROPAGE (throw, incident)', () => assert.ok(threw));
  }

  // --- un succès remet la série à zéro ---
  _test.reset();
  {
    let mode = 'fail';
    const check = withFailThreshold('demo2', async () => {
      if (mode === 'fail') throw new Error('timeout');
      return { state: 'active' };
    }, { threshold: 3 });
    await check();                 // 1/3
    mode = 'ok'; const ok = await check(); // succès → reset
    test('succès intercalé : série remise à zéro', () => {
      assert.strictEqual(ok.state, 'active');
      assert.strictEqual(_test.peek('demo2::demo2'), 0);
    });
    mode = 'fail';
    const again = await check();   // redevient 1/3, pas 3/3
    test('après reset : un nouvel échec est de nouveau toléré', () => assert.strictEqual(again.state, 'inactive'));
  }

  // --- clés indépendantes (sources paramétriques) ---
  _test.reset();
  {
    const check = withFailThreshold('param', async (combo) => { throw new Error('ko ' + combo); },
      { threshold: 2, keyFn: (args) => String(args[0]) });
    await check('A');              // A: 1/2 toléré
    let threwB = false;
    try { await check('A'); } catch (e) { threwB = true; } // A: 2/2 propage
    const rC = await check('C');   // C: 1/2 toléré, indépendant de A
    test('clés par combinaison indépendantes', () => {
      assert.ok(threwB, 'A aurait dû propager à 2/2');
      assert.strictEqual(rC.state, 'inactive', 'C doit encore être toléré');
    });
  }

  // --- seuil par défaut via env ---
  _test.reset();
  {
    process.env.SOURCE_FAIL_THRESHOLD = '1';
    const check = withFailThreshold('envd', async () => { throw new Error('x'); });
    let threw = false;
    try { await check(); } catch (e) { threw = true; }
    test('SOURCE_FAIL_THRESHOLD=1 : propage dès le 1er échec', () => assert.ok(threw));
    delete process.env.SOURCE_FAIL_THRESHOLD;
  }

  // --- fallback personnalisé ---
  _test.reset();
  {
    const check = withFailThreshold('fb', async () => { throw new Error('x'); },
      { threshold: 5, fallback: () => ({ state: 'inactive', note: 'repli-perso' }) });
    const r = await check();
    test('fallback personnalisé renvoyé tant qu\'on avale', () => assert.strictEqual(r.note, 'repli-perso'));
  }

  setImmediate(() => console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS présents.' : '.')));
})();
