// scripts/test-institutions-page.js — chantier « mairies » (LOT B-ter) : garde-fous des pages
// /institutions (vitrine PUBLIQUE indexable) et /institutions/publier (assistant, noindex).
// HORS DOM, hors réseau : lit les fichiers et vérifie scripts, voile de chargement, noindex,
// sitemap, redirection 301 de l'ancienne adresse, formulaire, accents sans mojibake.
// Lancer : node scripts/test-institutions-page.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public/institutions-publier.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/js/institutions-publier.js'), 'utf8');
const vitrine = fs.readFileSync(path.join(ROOT, 'public/institutions.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'server/routes/sitemap.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
const footer = fs.readFileSync(path.join(ROOT, 'server/partials/footer.html'), 'utf8');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };
const noInline = (h) => (h.match(/<script\b[^>]*>/gi) || []).filter((t) => !/\bsrc\s*=/.test(t)).length === 0;
const noMojibake = (h) => !/Ã|Â|â€/.test(h);

console.log('TEST pages /institutions et /institutions/publier (lot B-ter)');

// 1) Routage : nouvelle adresse + redirection 301 de l'ancienne.
ok(/app\.get\(\s*['"]\/institutions['"]/.test(index), 'route /institutions servie');
ok(/app\.get\(\s*['"]\/institutions\/publier['"]/.test(index), 'route /institutions/publier servie');
ok(/\/mairie\/publier[\s\S]{0,80}redirect\(\s*301\s*,\s*['"]\/institutions\/publier['"]/.test(index), '/mairie/publier → 301 /institutions/publier');

// 2) Assistant /institutions/publier : noindex, hors sitemap, pas de script inline, scripts à jour.
ok(noInline(html), 'assistant : aucun <script> inline');
ok(/\/js\/institutions-publier\.js/.test(html) && !/mairie-publier\.js/.test(html), 'assistant : script renommé (institutions-publier.js)');
ok(/<meta\s+name="robots"\s+content="noindex"/i.test(html), 'assistant : noindex');
ok(/classList\.remove\(\s*['"]loading['"]\s*\)/.test(js), 'assistant : retire body.loading (anti-page-vide)');
ok(!/\/mairie\/publier/.test(js), 'assistant JS : plus de référence à /mairie/publier');
ok(!/['"]\/institutions\/publier['"]/.test(sitemap) && !/\/mairie\b/.test(sitemap), 'assistant : hors sitemap');

// 2bis) Formulaire de demande d'accès conservé.
['mp-a-name', 'mp-a-type', 'mp-a-email', 'mp-a-accept', 'mp-a-website', 'mp-a-submit'].forEach(function (id) {
  ok(js.indexOf(id) !== -1, 'formulaire : champ ' + id + ' présent');
});
ok(/\/confidentialite/.test(js) && /Demande reçue/.test(js), 'case Confidentialité + écran « Demande reçue »');

// 3) Vitrine /institutions : PUBLIQUE, indexable, dans le sitemap, soignée, sans inline.
ok(noInline(vitrine), 'vitrine : aucun <script> inline');
ok(!/name="robots"\s+content="noindex"/i.test(vitrine), 'vitrine : indexable (pas de noindex)');
ok(/<title>[^<]*Institutions[^<]*<\/title>/.test(vitrine) && /<meta name="description"/.test(vitrine), 'vitrine : titre + meta description');
ok(/rel="canonical"\s+href="https:\/\/labonnealerte\.fr\/institutions"/.test(vitrine), 'vitrine : canonical /institutions');
ok(/['"]\/institutions['"]/.test(sitemap), 'vitrine : /institutions ajouté au sitemap');
ok(/Comment ça marche/i.test(vitrine) && /garanti/i.test(vitrine) && /ne fait pas/i.test(vitrine) && /Demander l[’']accès/i.test(vitrine), 'vitrine : sections (ça marche, garanties, ne fait pas, CTA)');
ok(/href="\/institutions\/publier"/.test(vitrine) && /mailto:contact@labonnealerte\.fr/.test(vitrine), 'vitrine : bouton Demander l’accès + contact');
ok(/<!--FOOTER-->/.test(vitrine) && /\/js\/header\.js/.test(vitrine), 'vitrine : même gabarit (footer + header)');
ok(noMojibake(vitrine) && noMojibake(html), 'accents corrects (aucun mojibake)');

// 4) Lien discret « Institutions » dans le pied de page public.
ok(/href="\/institutions"/.test(footer), 'footer : lien Institutions présent');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
