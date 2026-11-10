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

// ── 1b) Textes exacts (titre / texte / bouton) ──
const byId = {};
ENCARTS.forEach((e) => { byId[e.id] = e; });
const EXPECT = {
  'livraison-1e': {
    titre: "La livraison à 1 € t'a encore échappé ?",
    texte: "Laisse-nous faire le guet : on te prévient dès qu'elle revient.",
    bouton: 'Me prévenir',
  },
  aurores: {
    titre: "Comment ça, c'était hier, l'aurore boréale ?",
    texte: "Un ciel vert au-dessus de la France, tout le monde le savait… sauf toi. Cette fois, on te siffle avant.",
    bouton: 'Surveiller le ciel',
  },
  echeances: {
    titre: "Ton contrôle technique, il est pour quand déjà ?",
    texte: "Tu ne sais pas ? Nous si. On te rappelle.",
    bouton: 'Créer mon rappel',
  },
};
Object.keys(EXPECT).forEach((id) => {
  ['titre', 'texte', 'bouton'].forEach((champ) => {
    ok(byId[id] && byId[id][champ] === EXPECT[id][champ], 'texte exact — ' + id + '.' + champ);
  });
});

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

// ── 5) Rendu client : texte PAR-DESSUS l'image (titre + panneau), CTA vers l'alerte,
//      plus AUCUNE pastille « Pas une pub » ni bloc .encart-body séparé ──
const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'encarts.js'), 'utf8');
ok(!/Pas une pub/.test(clientSrc), 'plus de pastille « Pas une pub (promis) » dans le markup');
ok(!/encart-badge/.test(clientSrc) && !/encart-body/.test(clientSrc), 'plus de .encart-badge ni .encart-body');
ok(/class="encart-title"/.test(clientSrc), 'titre .encart-title présent (par-dessus l’image)');
ok(/class="encart-panel"/.test(clientSrc), 'panneau .encart-panel présent (bas de l’image)');
ok(/class="encart-text"/.test(clientSrc) && /class="encart-cta"/.test(clientSrc), 'sous-titre + bouton dans le panneau');
ok(/\/source\/'\s*\+\s*encodeURIComponent\(e\.slug\)\s*\+\s*'\/statut/.test(clientSrc), 'CTA → page de l’alerte /source/<slug>/statut (flux d’abonnement existant)');
ok(clientSrc.indexOf('À découvrir') !== -1 && /createElement\('article'\)/.test(clientSrc), 'encart = <article> aria-label « À découvrir »');

// ── 5b) CSS : image PORTRAIT 5/8 plein cadre + overlay (titre scrim / panneau beige) ──
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'site.css'), 'utf8');
ok(/\.encart-media\s*\{[^}]*aspect-ratio:\s*5\s*\/\s*8/.test(cssSrc), '.encart-media en ratio 5/8 (portrait)');
ok(!/\.encart-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/.test(cssSrc), 'plus de ratio 16/10 sur .encart-media');
ok(/\.encart\s*\{[^}]*position:\s*relative/.test(cssSrc), '.encart en position relative (ancre les calques)');
ok(/\.encart-title\s*\{[^}]*position:\s*absolute/.test(cssSrc), 'titre en overlay absolu (par-dessus l’image)');
ok(/\.encart-panel\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*0/.test(cssSrc), 'panneau en overlay absolu, ancré en bas');
ok(/--encart-panel-bg/.test(cssSrc) && /--encart-panel-ink/.test(cssSrc), 'fond beige + encre du panneau en variables (clair/sombre)');
ok(/--encart-scrim-h/.test(cssSrc) && /--encart-panel-h/.test(cssSrc), 'scrim/panneau réglables par encart (variables CSS)');
ok(/\.encart-cta\s*\{[^}]*align-self:\s*flex-end/.test(cssSrc), 'bouton aligné à droite dans le panneau');
ok(/\.encart-media[^{]*\{[^}]*max-height:\s*70vh/.test(cssSrc), 'mobile : hauteur d’image plafonnée (max-height 70vh)');

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
