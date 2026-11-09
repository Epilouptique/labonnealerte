// scripts/test-conditions-page.js — page « Conditions d'utilisation » (/conditions, alias /cgu).
// HORS DOM, hors réseau : lit les fichiers et le rendu assemblé (renderPage), vérifie le
// routage + redirection 301, la présence au sitemap, le lien dans le footer, le gabarit commun
// (header/footer, styles, SEO), le contenu exigé, l'absence de promesse (SLA/garantie) et de
// mojibake. Lancer : node scripts/test-conditions-page.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public/conditions.html'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'server/routes/sitemap.js'), 'utf8');
const footer = fs.readFileSync(path.join(ROOT, 'server/partials/footer.html'), 'utf8');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };
const noInline = (h) => (h.match(/<script\b[^>]*>/gi) || []).filter((t) => !/\bsrc\s*=/.test(t)).length === 0;
const noMojibake = (h) => !/Ã|Â|â€/.test(h);

console.log('TEST page /conditions (Conditions d\'utilisation)');

// 1) Routage : /conditions servie + /cgu → 301 /conditions.
ok(/app\.get\(\s*['"]\/conditions['"]/.test(index) && /sendPage\(\s*res\s*,\s*['"]conditions\.html['"]/.test(index), 'route /conditions servie (conditions.html)');
ok(/app\.get\(\s*['"]\/cgu['"][\s\S]{0,80}redirect\(\s*301\s*,\s*['"]\/conditions['"]/.test(index), '/cgu → 301 /conditions');

// 2) Sitemap : /conditions présent.
ok(/['"]\/conditions['"]/.test(sitemap), '/conditions ajouté au sitemap');

// 3) Footer : lien « Conditions d'utilisation » dans la section Légal, à côté des deux autres.
ok(/href="\/conditions">Conditions d'utilisation</.test(footer), 'footer : lien /conditions « Conditions d\'utilisation »');
ok(/href="\/mentions-legales"/.test(footer) && /href="\/confidentialite"/.test(footer), 'footer : toujours Mentions légales + Confidentialité');

// 4) Rendu assemblé : le serveur injecte bien le footer (gabarit commun) dans la page.
process.env.NODE_ENV = 'test';
const { renderPage } = require(path.join(ROOT, 'server', 'pages'));
const rendered = renderPage('conditions.html');
ok(/<footer>[\s\S]*href="\/conditions"/.test(rendered), 'renderPage(conditions.html) : footer commun injecté (marqueur remplacé)');
ok(!/<!--FOOTER-->/.test(rendered), 'marqueur <!--FOOTER--> remplacé dans le rendu');

// 5) Gabarit / SEO : mêmes styles, header, scripts, canonical, title, description, thème.
ok(/\/css\/site\.css/.test(html) && /\/css\/tokens\.css/.test(html) && /\/css\/fonts\.css/.test(html), 'feuilles de style communes liées');
ok(/\/js\/header\.js/.test(html) && /\/js\/theme\.js/.test(html), 'header.js + theme.js (header + clair/sombre)');
ok(/rel="canonical"\s+href="https:\/\/labonnealerte\.fr\/conditions"/.test(html), 'canonical /conditions');
ok(/<title>[^<]*Conditions d'utilisation[^<]*<\/title>/.test(html) && /<meta name="description"/.test(html), 'title + meta description');
ok(/data-theme="light"/.test(html) && /prefers-color-scheme: dark/.test(html), 'thème clair/sombre (comme les autres pages)');
ok(noInline(html), 'aucun <script> inline (CSP)');
ok(noMojibake(html), 'accents corrects (aucun mojibake)');

// 6) Contenu exigé (sections) + données éditeur reprises des mentions légales (rien inventé).
[
  ['Objet du service', /Objet du service/],
  ['Accès et compte', /Accès et compte/],
  ['Gratuité / sans pub / sans revente', /sans revente de données/i],
  ['Contenus des utilisateurs', /Contenus des utilisateurs/],
  ['Exactitude des alertes', /Exactitude des alertes/],
  ['Propriété intellectuelle / MIT', /licence <strong>MIT<\/strong>/],
  ['Limitation de responsabilité', /Limitation de responsabilité/],
  ['Suspension ou résiliation', /Suspension ou résiliation/],
  ['Modification des conditions', /Modification des conditions/],
  ['Droit applicable', /droit français/i],
].forEach(([label, re]) => ok(re.test(html), 'section : ' + label));
ok(/808 615 421/.test(html) && /05000 Gap/.test(html), 'données éditeur reprises (SIREN + adresse de Gap)');
ok(/contact@labonnealerte\.fr/.test(html), 'adresse de contact présente');
ok(/github\.com\/Epilouptique\/labonnealerte/.test(html), 'lien vers le dépôt public (open source)');
ok(/href="\/confidentialite"/.test(html), 'renvoi vers /confidentialite');
ok(/en l'état/.test(html) && /n'est pas un service d'urgence/i.test(html), 'alertes « en l\'état » + pas un service d\'urgence');
ok(/Dernière mise à jour\s*(&nbsp;|\s):\s*9 novembre 2026/.test(html), 'date de dernière mise à jour affichée (9 novembre 2026)');

// 7) Honnêteté : aucune promesse de niveau de service / garantie.
ok(!/\bSLA\b/i.test(html) && !/garantie de (disponibilité|service)[^.]*assur/i.test(html), 'aucune promesse SLA');
ok(!/garantissons|nous garantissons|service garanti/i.test(html), 'aucune garantie promise');
ok(!/A CONFIRMER/.test(html) && !/<ADRESSE>|&lt;ADRESSE&gt;/.test(html), 'aucun placeholder résiduel');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
