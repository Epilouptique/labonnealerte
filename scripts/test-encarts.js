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
    texte: "Un ciel vert au-dessus de la France, tout le monde le savait… sauf toi.",
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
ok(clientSrc.indexOf('À découvrir') !== -1 && /createElement\('article'\)/.test(clientSrc), 'encart = <article> aria-label « À découvrir »');

// ── 5d) CTA = BOUTON qui abonne en réutilisant le switch de la carte (pas de lien, pas de nav) ──
ok(/<button type="button" class="encart-cta">/.test(clientSrc), 'CTA = <button type="button"> (accessible clavier), pas un lien');
ok(!/encart-cta[^>]*href/.test(clientSrc) && !/\/statut/.test(clientSrc), 'plus de <a href> ni de navigation /source/<slug>/statut sur le CTA');
ok(/cardForSlug/.test(clientSrc) && /\.card\[data-source-id="/.test(clientSrc), 'le CTA retrouve la carte du kiosque par data-source-id');
ok(/dispatchEvent\(\s*new Event\(\s*['"]change['"]/.test(clientSrc) && /switch-row:not\(\.param-mute-row\):not\(\.param-follow-row\)/.test(clientSrc),
  'abonnement réutilisé : on simule le change du switch de la carte (aucun appel API nouveau)');
ok(/task-config/.test(clientSrc) && /param-follow/.test(clientSrc),
  'tâches / cartes paramétrées : on déclenche le même bouton (« + configurer » / param-follow)');
ok(!/fetch\s*\(/.test(clientSrc) && !/location\.(href|assign|replace)\b/.test(clientSrc),
  'encarts.js n’introduit aucun fetch d’abonnement ni aucune navigation propre (location.href/assign/replace)');
ok(/Abonné ✓/.test(clientSrc) && /is-subscribed/.test(clientSrc) && /data-subscribed/.test(clientSrc),
  'après succès : bouton « Abonné ✓ » (désactivé), reflété depuis data-subscribed de la carte');

// ── 5c) Anti-clignotement : l'apparition (is-placed) ne joue qu'UNE fois et la mesure ne
//      masque plus l'encart (display:none ré-animait à chaque passe) → parking hors de vue ──
ok(/var\s+revealed\s*=\s*false/.test(clientSrc) && /!revealed[\s\S]{0,60}add\(\s*['"]is-placed['"]/.test(clientSrc), 'is-placed ajouté une seule fois (drapeau revealed)');
ok(!/style\.display\s*=\s*['"]none['"][\s\S]{0,120}visibleCards\(\)/.test(clientSrc), 'plus de display:none juste avant la mesure des cartes (desktop)');
ok(/gridRowStart\s*=\s*['"]9999['"]/.test(clientSrc), 'mesure par parking (gridRowStart 9999), pas par masquage');

// ── 5b) CSS : image portrait PAR ENCART (hauteur naturelle) + overlay (titre scrim / panneau beige) ──
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'site.css'), 'utf8');
ok(/\.encart-media\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*5/.test(cssSrc), 'ratio UNIQUE 3/5 sur .encart-media (les 3 visuels sont en 600×1000)');
ok(!/\[data-encart-id="[^"]+"\]\s*\.encart-media\s*\{[^}]*aspect-ratio/.test(cssSrc), 'plus de règle d’aspect-ratio par data-encart-id');
ok(/\.encart\s*\{[^}]*position:\s*relative/.test(cssSrc), '.encart en position relative (ancre les calques)');
ok(/\.encart-title\s*\{[^}]*position:\s*absolute/.test(cssSrc), 'titre en overlay absolu (par-dessus l’image)');
ok(/\.encart-panel\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*0/.test(cssSrc), 'panneau en overlay absolu, ancré en bas');
ok(/--encart-panel-bg/.test(cssSrc) && /--encart-panel-ink/.test(cssSrc), 'fond beige + encre du panneau en variables (clair/sombre)');
ok(/--encart-scrim-h/.test(cssSrc) && /--encart-panel-h/.test(cssSrc), 'scrim/panneau réglables par encart (variables CSS)');
ok(/\.encart-cta\s*\{[^}]*align-self:\s*flex-end/.test(cssSrc), 'bouton aligné à droite dans le panneau');
ok(/@media[^{]*max-width:\s*640px[\s\S]*?\.encart-media\s*\{[^}]*max-height:\s*\d+vh/.test(cssSrc), 'mobile : hauteur d’image plafonnée (max-height Nvh)');

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
