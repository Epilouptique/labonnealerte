// scripts/test-mairie-publier-page.js — chantier « mairies » : garde-fous de la page
// /mairie/publier (assistant de saisie). HORS DOM, hors réseau : lit les fichiers et vérifie
// l'absence de script inline (CSP script-src 'self'), la présence et l'ordre des scripts
// requis, le retrait du voile de chargement, noindex, et l'absence du sitemap.
// Lancer : node scripts/test-mairie-publier-page.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public/mairie-publier.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/js/mairie-publier.js'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'server/routes/sitemap.js'), 'utf8');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST page /mairie/publier (garde-fous CSP / voile / noindex / sitemap)');

// 1) Aucun script INLINE (CSP script-src 'self' : un <script> sans src serait bloqué).
const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
const inline = scriptTags.filter((t) => !/\bsrc\s*=/.test(t));
ok(inline.length === 0, 'aucun <script> inline (tous externalisés)');

// 2) Scripts requis présents et dans l'ordre (comme /publier corrigé au lot 7).
const required = ['/js/theme.js', '/js/session.js', '/js/header.js', '/js/mairie-publier.js', '/js/pwa.js'];
const positions = required.map((s) => html.indexOf(s));
ok(positions.every((p) => p !== -1), 'les 5 scripts requis sont présents');
ok(positions.every((p, i) => i === 0 || p > positions[i - 1]), 'scripts dans le bon ordre (theme→session→header→mairie→pwa)');
ok(html.indexOf('/js/session.js') !== -1, 'session.js chargé (état de connexion)');

// 3) Le voile de chargement est retiré par le script (sinon page vide : body.loading masque main).
ok(/classList\.remove\(\s*['"]loading['"]\s*\)/.test(js), 'mairie-publier.js retire body.loading (anti-page-vide)');
ok(html.indexOf('class="loading"') !== -1, 'body démarre en loading (révélé par le script)');

// 4) Toujours un écran : les quatre états sont rendus (jamais de page vide) + garde-fou d'erreur.
ok(/Connexion requise/.test(js), 'état déconnecté : écran connexion');
ok(/Demande d’accès|Demande d'accès/.test(js), 'état sans organisation : écran demande d’accès');
ok(/En attente de vérification/.test(js), 'état pending : écran en attente de vérification');
ok(/function draw\s*\(/.test(js) && /catch\s*\(\s*e\s*\)\s*\{[^}]*root\.innerHTML/.test(js), 'erreur de script → message visible (render protège draw)');

// 4bis) Formulaire de demande d'accès (LOT B-bis) : champs obligatoires + honeypot + conditions.
['mp-a-name', 'mp-a-type', 'mp-a-ville', 'mp-a-role', 'mp-a-fonction', 'mp-a-email', 'mp-a-just', 'mp-a-accept'].forEach(function (id) {
  ok(js.indexOf("'" + id + "'") !== -1 || js.indexOf('"' + id + '"') !== -1 || js.indexOf(id) !== -1, 'formulaire : champ ' + id + ' présent');
});
ok(/mp-a-website/.test(js) && /left:-9999px/.test(js), 'honeypot anti-robot discret présent');
ok(/\/confidentialite/.test(js) && /accept/i.test(js), 'case d’acceptation avec lien Confidentialité');
ok(/300/.test(js) && /mp-a-just-count/.test(js), 'compteur de caractères (justification ≤300)');
ok(/Demande reçue/.test(js), 'écran « Demande reçue » après envoi');
ok(/En attente de vérification/.test(js) && /Motif/.test(js), 'écrans « en attente » et « motif » (refus/suspension)');

// 5) noindex et hors sitemap.
ok(/<meta\s+name="robots"\s+content="noindex"/i.test(html), 'meta robots noindex présent');
ok(!/['"]\/mairie\/publier['"]/.test(sitemap) && !/\/mairie\b/.test(sitemap), '/mairie/publier absent du sitemap (STATIC_PATHS)');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
