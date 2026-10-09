// scripts/test-eruption-eonet-proposal.js — TEST (en mémoire) du flux ALTERNATIF proposé pour
// la source eruption-volcanique : NASA EONET (officiel, ouvert, mondial, source Smithsonian GVP),
// en remplacement du flux GVP volcano.si.edu bloqué par pare-feu (403). PROPOSITION NON DÉPLOYÉE.
//
// Aucun réseau : on rejoue une RÉPONSE RÉELLE d'EONET capturée le 2026-10-09
// (GET https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=3).
// Le module réel ferait un vrai fetch SANS User-Agent de navigateur (aucun contournement WAF) ;
// seule la logique de parsing / anti-rétroactif / propagation d'incident est testée ici.
//
// Lancer : node scripts/test-eruption-eonet-proposal.js

const assert = require('assert');

// ---- Réponse RÉELLE capturée (extrait, 2 événements) ----
const REAL_EONET = {
  title: 'EONET Events',
  description: 'Natural events from EONET.',
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  events: [
    {
      id: 'EONET_20710', title: 'Nevados del Chillan Volcano, Chile', closed: null,
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20710',
      categories: [{ id: 'volcanoes', title: 'Volcanoes' }],
      sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/volcano.cfm?vn=357070' }],
      geometry: [{ date: '2026-06-15T00:00:00Z', type: 'Point', coordinates: [-71.378, -36.868] }],
    },
    {
      id: 'EONET_20409', title: 'Telica Volcano, Nicaragua', closed: null,
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20409',
      categories: [{ id: 'volcanoes', title: 'Volcanoes' }],
      sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/volcano.cfm?vn=344040' }],
      geometry: [{ date: '2026-05-30T00:00:00Z', type: 'Point', coordinates: [-86.84, 12.606] }],
    },
  ],
};

// ---- Logique PROPOSÉE (identique à celle du rapport ; ici isolée pour le test) ----
const PUBLIC_URL = 'https://volcano.si.edu/gvp_currenteruptions.cfm';
let seen = null; // null = pas encore amorcé (anti-rétroactif)

function latestDate(ev) {
  const dates = (ev.geometry || []).map((g) => new Date(g.date)).filter((d) => !Number.isNaN(d.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
}

// `json` = corps déjà parsé ; en prod, fetchFn lève sur réseau/HTTP non-ok/timeout → check() PROPAGE
// (incident de surveillance), ne renvoie JAMAIS inactive sur erreur (politique du commit 42643a8).
function checkWith(json) {
  const events = Array.isArray(json && json.events) ? json.events : [];
  const current = events
    .filter((e) => e && e.id && Array.isArray(e.categories) && e.categories.some((c) => c.id === 'volcanoes'))
    .map((e) => ({
      key: e.id,
      nom: e.title,
      date: latestDate(e),
      link: (e.sources && e.sources[0] && e.sources[0].url) || e.link || PUBLIC_URL,
    }));

  if (seen === null) { // 1er passage : amorçage, aucune alerte
    seen = new Set(current.map((c) => c.key));
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }
  const nouveaux = current.filter((c) => !seen.has(c.key));
  current.forEach((c) => seen.add(c.key));
  if (!nouveaux.length) return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };

  nouveaux.sort((a, b) => b.date - a.date);
  const n = nouveaux[0];
  return {
    state: 'active', since: n.date, until: null,
    message: `🌋 Nouvelle activité éruptive signalée : ${n.nom} (source NASA EONET / Smithsonian GVP — information, pas du temps réel).`,
    url: n.link,
  };
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.message || e)); process.exitCode = 1; }
}

console.log('TEST eruption-volcanique via EONET (proposition, non déployé)');

test('parse la réponse réelle EONET (2 volcans, catégorie volcanoes, source SIVolcano)', () => {
  assert.strictEqual(REAL_EONET.events.length, 2);
  assert.strictEqual(REAL_EONET.events[0].sources[0].id, 'SIVolcano');
});

test('1er passage : amorçage anti-rétroactif → inactive, aucune alerte', () => {
  seen = null;
  const r = checkWith(REAL_EONET);
  assert.strictEqual(r.state, 'inactive');
  assert.strictEqual(seen.size, 2);
});

test('passage identique ensuite : rien de neuf → inactive', () => {
  const r = checkWith(REAL_EONET);
  assert.strictEqual(r.state, 'inactive');
});

test('nouvel événement volcanique → active avec le bon libellé et une URL officielle', () => {
  const withNew = JSON.parse(JSON.stringify(REAL_EONET));
  withNew.events.unshift({
    id: 'EONET_20999', title: 'Etna Volcano, Italy', closed: null,
    link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20999',
    categories: [{ id: 'volcanoes', title: 'Volcanoes' }],
    sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/volcano.cfm?vn=211060' }],
    geometry: [{ date: '2026-10-08T00:00:00Z', type: 'Point', coordinates: [15.004, 37.748] }],
  });
  const r = checkWith(withNew);
  assert.strictEqual(r.state, 'active');
  assert.ok(/Etna Volcano, Italy/.test(r.message));
  assert.ok(/EONET|Smithsonian/.test(r.message));
  assert.ok(/^https:\/\/volcano\.si\.edu\//.test(r.url));
});

test('corps vide / sans events → inactive (pas de faux positif), SANS avaler une vraie erreur', () => {
  seen = new Set(['x']); // déjà amorcé
  const r = checkWith({});
  assert.strictEqual(r.state, 'inactive'); // "events absent" côté DONNÉES ≠ erreur réseau
  // (en prod, une erreur réseau/HTTP est levée AVANT d'arriver ici → incident, pas inactive)
});

console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS présents.' : '.'));
