// Test HORS LIGNE (LOT E1) : bce-taux-directeurs, fete-du-cinema, fuite-donnees-majeure.
// safe-fetch est stubé via require.cache (aucun réseau, aucune base). Vérifie : filtres,
// fraîcheur, messages ≤ 120 caractères, attribution HIBP, robots:true, seuil N=3, et que
// les lignes SQL sont insérées en 'review' (jamais publiées d'office).
// Usage : node scripts/test-lot-e1-sources.js
'use strict';
const path = require('path');
const fs = require('fs');
const SRV = path.join(__dirname, '..', 'server');

let calls = [];
const stub = (rel, exports) => {
  const file = require.resolve(path.join(SRV, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('safe-fetch', {
  safeFetchText: async (url, opts) => { calls.push({ url, opts }); return globalThis.__resp(url); },
  safeFetchJson: async (url, opts) => { calls.push({ url, opts }); return JSON.parse(globalThis.__resp(url)); },
  pubErr: (m) => new Error(m),
});
console.warn = () => {};

const bce = require(path.join(SRV, 'sources', 'bce-taux-directeurs'));
const cine = require(path.join(SRV, 'sources', 'fete-du-cinema'));
const hibp = require(path.join(SRV, 'sources', 'fuite-donnees-majeure'));

let ok = 0, ko = 0;
const t = (name, cond) => { if (cond) ok++; else { ko++; console.error('ÉCHEC :', name); } };

const now = new Date();
const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
const rss = (items) => `<rss><channel><title>x</title>${items.map(([title, d]) =>
  `<item><title>${title}</title><link>https://ex.org/${encodeURIComponent(title)}</link><pubDate>${d.toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;

(async () => {
  // ── BCE ──
  globalThis.__resp = () => rss([['Christine Lagarde: Interview', now], ['Monetary policy decisions', now], ['Account of the monetary policy meeting', now]]);
  calls = [];
  let r = await bce.check();
  t('bce actif sur « Monetary policy decisions »', r.state === 'active' && /Monetary%20policy%20decisions/.test(r.url));
  t('bce message en français ≤ 120', /BCE/.test(r.message) && r.message.length <= 120);
  t('bce robots:true', calls[0].opts.robots === true);
  globalThis.__resp = () => rss([['Philip R. Lane: Diagnostic Challenges for ECB Monetary Policy', now], ['ECB amends monetary policy implementation guidelines', now]]);
  t('bce ignore les autres titres', (await bce.check()).state === 'inactive');
  globalThis.__resp = () => rss([['Monetary policy decisions', old]]);
  t('bce inactif si décision ancienne', (await bce.check()).state === 'inactive');

  // ── CNC ──
  globalThis.__resp = () => rss([['Le CNC au Festival Lumière 2026', now], ['La Fête du cinéma est de retour du 28 juin au 1er juillet 2026', now]]);
  r = await cine.check();
  t('cinéma actif', r.state === 'active' && r.message.length <= 120 && /CNC/.test(r.message));
  globalThis.__resp = () => rss([['Le CNC au Festival Lumière 2026', now]]);
  t('cinéma inactif sans Fête du Cinéma', (await cine.check()).state === 'inactive');

  // ── HIBP ──
  const breach = (o) => JSON.stringify(Object.assign({ Name: 'X', Title: 'X', Domain: 'x.com', AddedDate: now.toISOString(), PwnCount: 10 }, o));
  globalThis.__resp = () => breach({ Name: 'PassSport', Title: 'PassSport', PwnCount: 6370000 });
  calls = [];
  r = await hibp.check();
  t('hibp actif ≥ 1 M', r.state === 'active' && r.url === 'https://haveibeenpwned.com/Breach/PassSport');
  t('hibp attribution + ≤ 120', r.message.includes('Source : Have I Been Pwned (CC BY 4.0)') && r.message.length <= 120);
  t('hibp robots:true', calls[0].opts.robots === true);
  globalThis.__resp = () => breach({ Domain: 'autosur.fr', PwnCount: 487000 });
  t('hibp actif domaine .fr', (await hibp.check()).state === 'active');
  globalThis.__resp = () => breach({ Name: 'Neogen', Domain: 'neogen.com', PwnCount: 435963 });
  t('hibp inactif < 1 M hors .fr', (await hibp.check()).state === 'inactive');
  globalThis.__resp = () => breach({ PwnCount: 9e6, AddedDate: old.toISOString() });
  t('hibp inactif si ancienne', (await hibp.check()).state === 'inactive');
  const long = hibp.formatMessage({ Title: 'Un nom de service extraordinairement long qui dépasse largement la place', PwnCount: 1.2e9 });
  t('hibp nom tronqué, attribution entière', long.length <= 120 && long.endsWith('(CC BY 4.0)'));

  // ── Seuil N=3 (défaut) : 2 échecs tolérés, le 3e lève ──
  globalThis.__resp = () => { throw new Error('HTTP 503'); };
  for (const [name, src] of [['bce', bce], ['cinéma', cine], ['hibp', hibp]]) {
    const a = await src.check(); const b = await src.check();
    let threw = false; try { await src.check(); } catch { threw = true; }
    t(`${name} seuil N=3`, a.state === 'inactive' && b.state === 'inactive' && threw);
  }

  // ── SQL : statut 'review', jamais published ; ps-plus absente ──
  const sql = fs.readFileSync(path.join(SRV, 'db', 'init.sql'), 'utf8');
  for (const id of ['bce-taux-directeurs', 'fuite-donnees-majeure', 'fete-du-cinema']) {
    const m = sql.match(new RegExp(`SELECT '${id}',[\\s\\S]*?WHERE NOT EXISTS`));
    t(`${id} inséré en review`, !!m && /'review'\s*\nWHERE NOT EXISTS$/.test(m[0]));
  }
  t('ps-plus-jeux-mois non créée', !/SELECT 'ps-plus-jeux-mois'/.test(sql));
  t('pas de fichier ps-plus', !fs.existsSync(path.join(SRV, 'sources', 'ps-plus-jeux-mois.js')));

  console.log(`${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
