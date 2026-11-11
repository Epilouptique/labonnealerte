// scripts/test-push-transports.js — IOS-02 : helper sendOne/deliverRows de server/webpush.js
// pour les deux transports (web VAPID, Expo iOS). Dépendances INJECTÉES (espions) :
// AUCUN envoi réel (ni web-push, ni exp.host), aucune base (pool simulé).
// Lancer : node scripts/test-push-transports.js
'use strict';
const assert = require('assert');
// routes/push.js charge sessions.js, qui exige une clé HMAC : valeur factice, test seulement.
process.env.TOKEN_HASH_SECRET = process.env.TOKEN_HASH_SECRET || 'test-push-transports-cle-factice-0123456789';
const wp = require('../server/webpush.js');
const { _isExpoToken } = require('../server/routes/push.js');

let passed = 0, fails = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { fails++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

const PAYLOAD = wp._buildPayload({ name: 'Vigilance', message: 'Orages', url: 'https://labonnealerte.fr/source/x' });
const TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]';
const webRow = { id: 1, kind: 'web', endpoint: 'https://push.example/abc', p256dh: 'P', auth: 'A' };
const expoRow = { id: 2, kind: 'expo', endpoint: TOKEN, p256dh: null, auth: null };

function webSpy(behaviour) {
  const calls = [];
  return { calls, sendNotification: async (sub, body) => { calls.push({ sub, body }); if (behaviour) throw behaviour; } };
}
function fetchSpy(status, json, throws) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (throws) throw throws;
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  fn.calls = calls;
  return fn;
}
// Capture les journaux pour vérifier qu'aucun jeton n'y apparaît.
function captureErrors(run) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  return run().finally(() => { console.error = orig; }).then((r) => ({ r, lines }));
}

(async () => {
  console.log('test-push-transports');

  await t('payload : valeurs par défaut inchangées', () => {
    assert.deepStrictEqual(wp._buildPayload({}), {
      title: 'La Bonne Alerte', body: 'Une alerte que vous suivez vient de se déclencher.', url: 'https://labonnealerte.fr',
    });
    assert.strictEqual(wp._buildPayload({ statusUrl: 'https://s' }).url, 'https://s');
  });

  await t('web : même appel web-push qu avant (abonnement + JSON title/body/url)', async () => {
    const spy = webSpy();
    assert.strictEqual(await wp._sendOne(webRow, PAYLOAD, { webpush: spy, webEnabled: true }), 'sent');
    assert.deepStrictEqual(spy.calls[0].sub, { endpoint: webRow.endpoint, keys: { p256dh: 'P', auth: 'A' } });
    assert.strictEqual(spy.calls[0].body, JSON.stringify({ title: 'Vigilance', body: 'Orages', url: 'https://labonnealerte.fr/source/x' }));
  });

  await t('web : ligne sans kind = web (lignes existantes)', async () => {
    const spy = webSpy();
    assert.strictEqual(await wp._sendOne({ ...webRow, kind: undefined }, PAYLOAD, { webpush: spy, webEnabled: true }), 'sent');
  });

  await t('web : 404 et 410 = abonnement mort ; autre erreur = failed', async () => {
    for (const code of [404, 410]) {
      assert.strictEqual(await wp._sendOne(webRow, PAYLOAD, { webpush: webSpy(Object.assign(new Error('x'), { statusCode: code })), webEnabled: true }), 'dead');
    }
    const { r } = await captureErrors(() => wp._sendOne(webRow, PAYLOAD, { webpush: webSpy(Object.assign(new Error('x'), { statusCode: 500 })), webEnabled: true }));
    assert.strictEqual(r, 'failed');
  });

  await t('web : VAPID absent = ligne ignorée, web-push jamais appelé', async () => {
    const spy = webSpy();
    assert.strictEqual(await wp._sendOne(webRow, PAYLOAD, { webpush: spy, webEnabled: false }), 'skipped');
    assert.strictEqual(spy.calls.length, 0);
  });

  await t('expo : POST exp.host, JSON { to, title, body, data: { url } }, sans clé serveur', async () => {
    const f = fetchSpy(200, { data: { status: 'ok', id: 't1' } });
    assert.strictEqual(await wp._sendOne(expoRow, PAYLOAD, { fetch: f }), 'sent');
    const { url, init } = f.calls[0];
    assert.strictEqual(url, 'https://exp.host/--/api/v2/push/send');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers['Content-Type'], 'application/json');
    assert.ok(!('Authorization' in init.headers));
    assert.deepStrictEqual(JSON.parse(init.body), { to: TOKEN, title: 'Vigilance', body: 'Orages', data: { url: 'https://labonnealerte.fr/source/x' } });
  });

  await t('expo : envoyé même si VAPID est absent (piège)', async () => {
    const f = fetchSpy(200, { data: [{ status: 'ok' }] });
    assert.strictEqual(await wp._sendOne(expoRow, PAYLOAD, { fetch: f, webEnabled: false, webpush: webSpy() }), 'sent');
    assert.strictEqual(f.calls.length, 1);
  });

  await t('expo : DeviceNotRegistered = abonnement mort (même purge qu un 404/410)', async () => {
    const f = fetchSpy(200, { data: { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } });
    assert.strictEqual(await wp._sendOne(expoRow, PAYLOAD, { fetch: f }), 'dead');
  });

  await t('expo : autres erreurs = failed, journal avec le code, jamais le jeton', async () => {
    const cases = [
      fetchSpy(200, { data: { status: 'error', message: TOKEN + ' trop gros', details: { error: 'MessageTooBig' } } }),
      fetchSpy(429, { errors: [{ code: 'TOO_MANY_REQUESTS', message: 'x' }] }),
      fetchSpy(502, null),
      fetchSpy(0, null, Object.assign(new Error('réseau ' + TOKEN), { name: 'TypeError' })),
    ];
    for (const f of cases) {
      const { r, lines } = await captureErrors(() => wp._sendOne(expoRow, PAYLOAD, { fetch: f }));
      assert.strictEqual(r, 'failed');
      assert.ok(lines.length === 1, 'une ligne de journal');
      assert.ok(!lines.join(' ').includes('AbCdEf'), 'jeton absent du journal : ' + lines.join(' '));
    }
  });

  await t('deliverRows : comptes et purge commune des deux transports', async () => {
    const deleted = [];
    const pool = { query: async (sql, params) => { deleted.push({ sql, params }); return { rows: [] }; } };
    const f = async (url, init) => {
      const to = JSON.parse(init.body).to;
      const dead = to.includes('Dead');
      return { ok: true, status: 200, json: async () => ({ data: dead ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' } }) };
    };
    const rows = [
      webRow,
      { ...webRow, id: 3, endpoint: 'https://push.example/gone' },
      expoRow,
      { ...expoRow, id: 4, endpoint: 'ExponentPushToken[DeadDeadDead]' },
    ];
    const web = { sendNotification: async (sub) => { if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('x'), { statusCode: 410 }); } };
    const r = await wp._deliverRows(rows, { name: 'A' }, { webpush: web, webEnabled: true, fetch: f, pool });
    assert.deepStrictEqual(r, { sent: 2, failed: 0, removed: 2 });
    assert.strictEqual(deleted.length, 1);
    assert.deepStrictEqual(deleted[0].params[0].sort(), [3, 4]);
  });

  await t('deliverRows : VAPID absent = seules les lignes Expo partent', async () => {
    const f = fetchSpy(200, { data: { status: 'ok' } });
    const spy = webSpy();
    const r = await wp._deliverRows([webRow, expoRow], {}, { webpush: spy, webEnabled: false, fetch: f, pool: { query: async () => ({ rows: [] }) } });
    assert.deepStrictEqual(r, { sent: 1, failed: 0, removed: 0 });
    assert.strictEqual(spy.calls.length, 0);
  });

  await t('route : format du jeton Expo', () => {
    assert.ok(_isExpoToken(TOKEN));
    assert.ok(_isExpoToken('ExpoPushToken[abc_DEF-123]'));
    for (const bad of ['', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'FooPushToken[abc]', TOKEN + ' ', null, 42]) {
      assert.ok(!_isExpoToken(bad), String(bad));
    }
  });

  console.log(`\n${passed} réussi(s), ${fails} échec(s)`);
  process.exit(fails ? 1 : 0);
})();
