// Test HORS LIGNE : vérifie que le garde-fou « propager après N échecs consécutifs »
// (server/sources/lib/fail-threshold.js) est correctement câblé dans les 4 sources qui
// avalaient leurs erreurs par combo en `inactive` : veille-rss, veille-page, veille-agenda
// et la fabrique PanneauPocket (createParamSource + createBroadcastSource).
//
// Pour CHAQUE source : un fetch TOUJOURS en échec → les appels 1 et 2 restent tolérés
// (le combo renvoie inactive, pas de throw), l'appel 3 (N=3) LÈVE (le poller en fait un
// incident). Puis un cas échec/échec/SUCCÈS/échec : le succès réinitialise la série,
// donc le dernier échec ne lève pas.
//
// Ces sources passent par safeFetchText (server/safe-fetch), pas par node-fetch : on stube
// donc safe-fetch via require.cache. Les caches internes des sources (TTL jusqu'à 6 h) sont
// contournés en avançant une horloge simulée (Date.now) de 8 h entre chaque appel, ce qui
// force un vrai re-fetch à chaque fois. Aucun réseau, aucune base.
// Usage : node scripts/test-fail-threshold-sources.js
'use strict';
const path = require('path');
const SRV = path.join(__dirname, '..', 'server');

// ── Horloge simulée : avancer au-delà des TTL force un re-fetch à chaque appel ──
let CLOCK = 1_700_000_000_000;
const STEP_MS = 8 * 60 * 60 * 1000; // > tous les TTL des sources (max 6 h)
Date.now = () => CLOCK;
const tick = () => { CLOCK += STEP_MS; };

// ── Stub safe-fetch : safeFetchText délègue à globalThis.__fetchText ──
const stub = (rel, exports) => {
  const file = require.resolve(path.join(SRV, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('safe-fetch', {
  safeFetchText: async (...a) => globalThis.__fetchText(...a),
  pubErr: (msg) => { const e = new Error(msg); e.public = true; return e; },
  BROWSER_UA: 'test-agent',
});

// Silence des warn (on vérifie le comportement, pas les logs).
console.log = () => {};
console.warn = () => {};

const ft = require(path.join(SRV, 'sources', 'lib', 'fail-threshold'));
const veilleRss = require(path.join(SRV, 'sources', 'veille-rss'));
const veillePage = require(path.join(SRV, 'sources', 'veille-page'));
const veilleAgenda = require(path.join(SRV, 'sources', 'veille-agenda'));
const { createParamSource, createBroadcastSource } = require(path.join(SRV, 'sources', 'lib', 'panneaupocket-veille'));

// Sources PanneauPocket de test (la fabrique est le code réellement exercé).
const ppParam = createParamSource({ id: 'pp-param-test', paramsSchema: [] });
const ppBroadcast = createBroadcastSource({ id: 'pp-broadcast-test', url: 'https://app.panneaupocket.com/ville/test' });

// Contenu « succès » (fetch+parse OK) par source — minimal, accepté par chaque parseur.
const SUCCESS = {
  'veille-rss': '<?xml version="1.0"?><rss><channel></channel></rss>',
  'veille-page': '<html><body>contenu stable</body></html>',
  'veille-agenda': 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n',
  'pp-param': '<html><body></body></html>',
  'pp-broadcast': '<html><body></body></html>',
};

// Combos plausibles (passent les paramsSchema / validateurs).
const sources = {
  'veille-rss': {
    success: SUCCESS['veille-rss'],
    run: async () => {
      const out = await veilleRss.checkWithParams([{ flux: 'https://exemple.fr/rss.xml' }]);
      return out[0].state;
    },
  },
  'veille-page': {
    success: SUCCESS['veille-page'],
    run: async () => {
      const out = await veillePage.checkWithParams([{ url: 'https://exemple.fr/page' }]);
      return out[0].state;
    },
  },
  'veille-agenda': {
    success: SUCCESS['veille-agenda'],
    run: async () => {
      const out = await veilleAgenda.checkWithParams([
        { agenda: 'https://calendar.google.com/calendar/ical/abc/basic.ics', preavis: '1' },
      ]);
      return out[0].state;
    },
  },
  'pp-param': {
    success: SUCCESS['pp-param'],
    run: async () => {
      const out = await ppParam.checkWithParams([{ url: 'https://app.panneaupocket.com/ville/test' }]);
      return out[0].state;
    },
  },
  'pp-broadcast': {
    success: SUCCESS['pp-broadcast'],
    run: async () => (await ppBroadcast.check()).state,
  },
};

let fails = 0;
const log = [];
const ok = (c, msg) => { log.push((c ? 'OK   ' : 'ECHEC') + ' ' + msg); if (!c) fails++; };

const netError = () => { const e = new Error('réseau coupé (simulé)'); return e; };

// Lance un appel de la source `name`. `fail` = le fetch échoue ; sinon il réussit.
// Avance l'horloge d'abord pour expirer les caches internes.
async function invoke(name, fail) {
  tick();
  const s = sources[name];
  globalThis.__fetchText = async () => { if (fail) throw netError(); return s.success; };
  return s.run(); // peut throw (escalade au Nᵉ échec)
}

async function expectTolerated(name, label) {
  try {
    const state = await invoke(name, true);
    ok(state === 'inactive', `${name} : ${label} → toléré (inactive, pas de throw)`);
  } catch (e) {
    ok(false, `${name} : ${label} → NE DOIT PAS lever, or a levé (« ${e.message} »)`);
  }
}

async function expectEscalate(name, label) {
  try {
    await invoke(name, true);
    ok(false, `${name} : ${label} → DOIT lever, or n'a pas levé`);
  } catch (e) {
    ok(/échecs consécutifs \(seuil 3\)/.test(e.message), `${name} : ${label} → LÈVE (« ${e.message} »)`);
  }
}

async function expectSuccess(name) {
  try {
    const state = await invoke(name, false);
    ok(state === 'inactive', `${name} : fetch OK (rien à signaler) → inactive = SUCCÈS (série réinitialisée)`);
  } catch (e) {
    ok(false, `${name} : fetch OK ne doit pas lever, or a levé (« ${e.message} »)`);
  }
}

(async () => {
  for (const name of Object.keys(sources)) {
    // ── Cas A : 3 échecs d'affilée → tolérés, toléré, LÈVE ──
    ft._test.reset();
    await expectTolerated(name, 'échec 1/3');
    await expectTolerated(name, 'échec 2/3');
    await expectEscalate(name, 'échec 3/3');

    // ── Cas B : échec, échec, SUCCÈS, échec → ne lève pas (série remise à zéro) ──
    ft._test.reset();
    await expectTolerated(name, 'échec 1/3 (avant succès)');
    await expectTolerated(name, 'échec 2/3 (avant succès)');
    await expectSuccess(name);
    await expectTolerated(name, 'échec 1/3 après réinitialisation (ne lève pas)');
  }

  console.info(log.join('\n'));
  console.info(fails ? `\n${fails} échec(s)` : `\nTous les cas passent (${log.length}).`);
  process.exit(fails ? 1 : 0);
})();
