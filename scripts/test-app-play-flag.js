// scripts/test-app-play-flag.js — interrupteur APP_PLAY_URL_ENABLED (logique pure).
// Vérifie : absente = désactivé ; "true" = activé ; toute autre valeur = désactivé.
// Lancer : node scripts/test-app-play-flag.js
'use strict';
let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

function fresh() { delete require.cache[require.resolve('../server/app-play-flag')]; return require('../server/app-play-flag').appPlayUrlEnabled; }

console.log('TEST interrupteur APP_PLAY_URL_ENABLED (bloc « Sur mon smartphone »)');
delete process.env.APP_PLAY_URL_ENABLED;
ok(fresh()() === false, 'variable ABSENTE → désactivé (défaut sûr : fiche Play non publiée)');
process.env.APP_PLAY_URL_ENABLED = 'true';
ok(fresh()() === true, '"true" → activé');
process.env.APP_PLAY_URL_ENABLED = ' true ';
ok(fresh()() === true, '"true" avec espaces → activé (trim)');
process.env.APP_PLAY_URL_ENABLED = 'TRUE';
ok(fresh()() === false, '"TRUE" (casse) → désactivé (valeur exacte requise)');
process.env.APP_PLAY_URL_ENABLED = '1';
ok(fresh()() === false, '"1" → désactivé');
process.env.APP_PLAY_URL_ENABLED = 'false';
ok(fresh()() === false, '"false" → désactivé');
delete process.env.APP_PLAY_URL_ENABLED;

// Intégration pages.js : l'attribut data-lba-app-play suit le drapeau, et <html> porte
// TOUJOURS les deux drapeaux (publish + app-play). Rendu réel d'index.html via renderPage.
process.env.NODE_ENV = 'test'; // pas de cache mémoire → chaque rendu relit le drapeau courant
function renderHome() {
  delete require.cache[require.resolve('../server/pages')];
  delete require.cache[require.resolve('../server/app-play-flag')];
  delete require.cache[require.resolve('../server/publish-flag')];
  return require('../server/pages').renderPage('index.html');
}
delete process.env.APP_PLAY_URL_ENABLED;
let html = renderHome();
ok(/<html[^>]*\sdata-lba-app-play="false"/.test(html), 'pages.js : sans variable → data-lba-app-play="false"');
ok(/<html[^>]*\sdata-lba-publish="/.test(html), 'pages.js : data-lba-publish toujours présent (non régressé)');
process.env.APP_PLAY_URL_ENABLED = 'true';
html = renderHome();
ok(/<html[^>]*\sdata-lba-app-play="true"/.test(html), 'pages.js : APP_PLAY_URL_ENABLED=true → data-lba-app-play="true"');
delete process.env.APP_PLAY_URL_ENABLED;

// Jumeau iOS : APP_APPSTORE_URL_ENABLED, indépendant de la variable Play.
function freshIos() { delete require.cache[require.resolve('../server/app-appstore-flag')]; return require('../server/app-appstore-flag').appAppStoreUrlEnabled; }
delete process.env.APP_APPSTORE_URL_ENABLED;
ok(freshIos()() === false, 'APP_APPSTORE_URL_ENABLED absente → désactivé');
process.env.APP_APPSTORE_URL_ENABLED = 'true';
ok(freshIos()() === true, 'APP_APPSTORE_URL_ENABLED="true" → activé');
process.env.APP_APPSTORE_URL_ENABLED = 'TRUE';
ok(freshIos()() === false, 'APP_APPSTORE_URL_ENABLED="TRUE" → désactivé (valeur exacte requise)');
function renderHomeIos() { delete require.cache[require.resolve('../server/app-appstore-flag')]; return renderHome(); }
process.env.APP_APPSTORE_URL_ENABLED = 'true';
html = renderHomeIos();
ok(/<html[^>]*\sdata-lba-app-appstore="true"/.test(html) && /<html[^>]*\sdata-lba-app-play="false"/.test(html),
  'pages.js : App Store actif, Play inactif → attributs indépendants');
delete process.env.APP_APPSTORE_URL_ENABLED;
html = renderHomeIos();
ok(/<html[^>]*\sdata-lba-app-appstore="false"/.test(html), 'pages.js : sans variable → data-lba-app-appstore="false"');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
