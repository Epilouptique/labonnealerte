// scripts/test-publish-flag.js — interrupteur PUBLISH_ENABLED (logique pure).
// Vérifie : absente = désactivé ; "true" = activé ; toute autre valeur = désactivé.
// Lancer : node scripts/test-publish-flag.js
'use strict';
let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

function fresh() { delete require.cache[require.resolve('../server/publish-flag')]; return require('../server/publish-flag').publishEnabled; }

console.log('TEST interrupteur PUBLISH_ENABLED');
delete process.env.PUBLISH_ENABLED;
ok(fresh()() === false, 'variable ABSENTE → désactivé (défaut sûr)');
process.env.PUBLISH_ENABLED = 'true';
ok(fresh()() === true, '"true" → activé');
process.env.PUBLISH_ENABLED = ' true ';
ok(fresh()() === true, '"true" avec espaces → activé (trim)');
process.env.PUBLISH_ENABLED = 'TRUE';
ok(fresh()() === false, '"TRUE" (casse) → désactivé (valeur exacte requise)');
process.env.PUBLISH_ENABLED = '1';
ok(fresh()() === false, '"1" → désactivé');
process.env.PUBLISH_ENABLED = 'false';
ok(fresh()() === false, '"false" → désactivé');
delete process.env.PUBLISH_ENABLED;

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
