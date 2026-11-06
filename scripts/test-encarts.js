// scripts/test-encarts.js — « encarts sympas » (hors ligne : aucune base, aucun réseau).
// Vérifie la liste de données, l'éligibilité (jamais d'encart dont l'alerte n'existe pas ou
// actif:false), le tirage (0 ou 1, jamais 2), l'injection serveur des attributs, et que les
// slugs cibles existent bien dans le catalogue (server/db/init.sql).
// Lancer : node scripts/test-encarts.js
'use strict';
const fs = require('fs');
const path = require('path');
let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

const { ENCARTS, eligibleEncarts, pickEncart, hasRequired } = require('../public/js/encarts.js');

console.log('TEST encarts sympas');

// ── 1) Liste de données : 3 encarts, champs obligatoires ──
ok(Array.isArray(ENCARTS) && ENCARTS.length === 3, '3 encarts définis');
ok(ENCARTS.every(hasRequired), 'chaque encart a id, slug, titre, texte, bouton');
const ids = ENCARTS.map((e) => e.id).sort();
ok(JSON.stringify(ids) === JSON.stringify(['aurores', 'echeances', 'livraison-1e']), 'ids attendus : aurores, echeances, livraison-1e');

// ── 2) Slugs cibles réels (garde-fou : présents dans le catalogue init.sql) ──
const initSql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'init.sql'), 'utf8');
ENCARTS.forEach((e) => {
  ok(initSql.indexOf("'" + e.slug + "'") !== -1, 'slug « ' + e.slug + " » existe dans le catalogue (init.sql)");
});

// ── 3) Éligibilité : seules les alertes EXISTANTES et actif!==false sont retenues ──
const allIds = ENCARTS.map((e) => e.slug);
ok(eligibleEncarts(ENCARTS, allIds).length === 3, 'toutes alertes présentes → 3 éligibles');
ok(eligibleEncarts(ENCARTS, []).length === 0, 'aucune alerte présente → 0 éligible (jamais d’encart fantôme)');
// alerte inexistante : on retire aurores-france du catalogue → encart aurores exclu
const sansAurores = allIds.filter((s) => s !== 'aurores-france');
const elig2 = eligibleEncarts(ENCARTS, sansAurores);
ok(!elig2.some((e) => e.id === 'aurores'), 'alerte inexistante → son encart n’est JAMAIS éligible');
ok(elig2.length === 2, 'les autres encarts restent éligibles');
// actif:false exclut même si l'alerte existe
const withInactive = ENCARTS.map((e) => (e.id === 'livraison-1e' ? Object.assign({}, e, { actif: false }) : e));
ok(!eligibleEncarts(withInactive, allIds).some((e) => e.id === 'livraison-1e'), 'actif:false → exclu même si l’alerte existe');

// ── 4) Tirage : 0 ou 1 (jamais 2), forçage respecté, jamais un encart non éligible ──
const one = pickEncart(eligibleEncarts(ENCARTS, allIds), null, () => 0);
ok(one && one.id, 'tirage aléatoire → exactement 1 encart (objet unique)');
ok(pickEncart([], null) === null, 'aucun éligible → null (0 encart)');
ok(pickEncart(eligibleEncarts(ENCARTS, allIds), 'aurores').id === 'aurores', 'forçage ?encart=aurores → l’encart aurores');
ok(pickEncart(eligibleEncarts(ENCARTS, sansAurores), 'aurores') === null, 'forçage d’un encart NON éligible → null (jamais affiché)');
// balayage du tirage aléatoire : toujours un seul, toujours éligible
let allSingle = true;
for (let i = 0; i < 30; i++) {
  const r = pickEncart(eligibleEncarts(ENCARTS, allIds), null, () => i / 30);
  if (!r || typeof r !== 'object' || Array.isArray(r)) { allSingle = false; break; }
}
ok(allSingle, '30 tirages : toujours un objet unique (jamais 2, jamais une liste)');

// ── 5) Rendu client : la pastille « Pas une pub (promis) » et le CTA vers l'alerte ──
const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'encarts.js'), 'utf8');
ok(/Pas une pub \(promis\)/.test(clientSrc), 'mention « Pas une pub (promis) » présente dans le rendu');
ok(/\/source\/'\s*\+\s*encodeURIComponent\(e\.slug\)\s*\+\s*'\/statut/.test(clientSrc), 'CTA → page de l’alerte /source/<slug>/statut (flux d’abonnement existant)');
ok(clientSrc.indexOf('À découvrir') !== -1 && /createElement\('article'\)/.test(clientSrc), 'encart = <article> aria-label « À découvrir »');

// ── 6) Injection serveur : attributs <html> data-lba-encart-img / -test ──
process.env.NODE_ENV = 'test';
function renderHome() {
  ['../server/pages', '../server/encarts', '../server/app-play-flag', '../server/publish-flag'].forEach((m) => {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
  });
  return require('../server/pages').renderPage('index.html');
}
const html = renderHome();
ok(/<html[^>]*\sdata-lba-encart-img="/.test(html), 'pages.js injecte data-lba-encart-img');
ok(/data-lba-encart-img="\{\}"/.test(html) || /data-lba-encart-img="\{&quot;/.test(html), 'data-lba-encart-img = JSON (vide tant qu’aucun visuel)');
ok(/<html[^>]*\sdata-lba-encart-test="1"/.test(html), 'hors production → data-lba-encart-test="1" (forçage de test autorisé)');
ok(/<script src="\/js\/encarts\.js"><\/script>/.test(html), 'index.html charge /js/encarts.js');
process.env.NODE_ENV = 'production';
const htmlProd = renderHome();
ok(/data-lba-encart-test="0"/.test(htmlProd), 'en production → data-lba-encart-test="0" (forçage désactivé)');
delete process.env.NODE_ENV;

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
