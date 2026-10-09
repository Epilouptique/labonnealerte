// scripts/test-sitemap-enabled.js — le sitemap public n'expose QUE les sources actives.
// Hors ligne : on stube la base (émule le filtre WHERE enabled = true à partir du SQL) et le
// module forum (CATEGORIES), puis on invoque le handler de /sitemap.xml et on vérifie qu'une
// source désactivée est ABSENTE et une source active PRÉSENTE. Si quelqu'un retirait le
// « WHERE enabled = true » de la requête, le stub renverrait les deux → ce test échouerait.
// Lancer : node scripts/test-sitemap-enabled.js
'use strict';
const path = require('path');
const assert = require('assert');
const SRV = path.join(__dirname, '..', 'server');

const stub = (rel, exports) => {
  const file = require.resolve(path.join(SRV, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// Fixture : une source active, une désactivée.
const SOURCES = [{ id: 'source-active', enabled: true }, { id: 'source-desactivee', enabled: false }];

// Base émulée : applique le filtre enabled selon le SQL reçu (c'est le point testé).
stub('db', { pool: { query: async (sql) => {
  const q = String(sql).replace(/\s+/g, ' ');
  if (/FROM sources/i.test(q)) {
    const rows = /enabled\s*=\s*true/i.test(q) ? SOURCES.filter((s) => s.enabled) : SOURCES.slice();
    return { rows: rows.map((s) => ({ id: s.id })) };
  }
  if (/FROM forum_topics/i.test(q)) return { rows: [] };
  return { rows: [] };
} } });
// Évite de charger les dépendances de forum.js.
stub('routes/forum', { CATEGORIES: { urgences: 'Urgences' } });

const router = require(path.join(SRV, 'routes', 'sitemap'));
// Récupère le handler GET /sitemap.xml depuis la pile du router (sans moteur express complet).
const layer = router.stack.find((l) => l.route && l.route.path === '/sitemap.xml');
const handle = layer.route.stack[0].handle;

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

(async () => {
  console.log('TEST sitemap : exclut les sources enabled=false');
  let body = '';
  const res = {
    type: () => res, set: () => res, status: () => res,
    send: (x) => { body = String(x); return res; },
  };
  await handle({ method: 'GET', url: '/sitemap.xml', headers: {}, query: {} }, res, () => {});

  ok(/<loc>https:\/\/labonnealerte\.fr\/source\/source-active\/statut<\/loc>/.test(body),
    'la source ACTIVE apparaît dans le sitemap');
  ok(!/source-desactivee/.test(body),
    'la source DÉSACTIVÉE (enabled=false) est ABSENTE du sitemap');
  ok(/<loc>https:\/\/labonnealerte\.fr\/<\/loc>/.test(body), 'les pages fixes sont présentes (santé du rendu)');

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
