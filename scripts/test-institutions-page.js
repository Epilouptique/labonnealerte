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
ok(/Comment ça marche/i.test(vitrine) && /garanti/i.test(vitrine) && /Demander l[’']accès/i.test(vitrine), 'vitrine : sections (ça marche, garanties, CTA)');
ok(/href="\/institutions\/publier"/.test(vitrine) && /href="mailto:/.test(vitrine), 'vitrine : bouton Demander l’accès + contact');
ok(/<!--FOOTER-->/.test(vitrine) && /\/js\/header\.js/.test(vitrine), 'vitrine : même gabarit (footer + header)');
ok(noMojibake(vitrine) && noMojibake(html), 'accents corrects (aucun mojibake)');

// 4) Bloc dédié « Institutions » dans le pied de page public (lot B-quater).
ok(/href="\/institutions"/.test(footer), 'footer : lien vers /institutions présent');
ok(/footer-institutions/.test(footer) && /Institutions et collectivit/i.test(footer), 'footer : bloc dédié « Institutions et collectivités »');
ok(/>Mairies</.test(footer) && />Syndicats</.test(footer) && />Associations</.test(footer), 'footer : liens Mairies / Syndicats / Associations');

// 5) Thème institutionnel dédié (lot B-quater), appliqué aux deux pages, pas ailleurs.
const css = fs.readFileSync(path.join(ROOT, 'public/css/institutions.css'), 'utf8');
ok(/\/css\/institutions\.css/.test(vitrine), 'vitrine : feuille de style dédiée liée');
ok(/\/css\/institutions\.css/.test(html), 'assistant : feuille de style dédiée liée');
ok(/<body class="[^"]*\binst\b/.test(vitrine) && /<body class="[^"]*\binst\b/.test(html), 'les deux pages portent la classe body.inst');
// Aucune règle ne doit fuir hors de body.inst : toute ligne de sélecteur commençant
// en colonne 0 et ouvrant un bloc `{` doit être soit @… (media/keyframes), soit body.inst….
const leaks = css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .filter((l) => /\{\s*$/.test(l) && /^\S/.test(l))
  .filter((l) => !/^@/.test(l) && !/^body\.inst\b/.test(l));
ok(leaks.length === 0, 'CSS : toutes les règles sont préfixées body.inst (pas de fuite)');

// 6) Honnêteté éditoriale : jamais de concurrent cité, emplacement hébergement balisé.
ok(!/panneaupocket/i.test(vitrine), 'vitrine : aucune mention de concurrent');
ok(/Union européenne/i.test(vitrine) && /domaine enregistré en France/i.test(vitrine), 'vitrine : mention édition/hébergement (UE + domaine FR)');
ok(!/héberg[ée]*\s+en\s+France/i.test(vitrine), 'vitrine : pas de promesse « hébergé en France »');
ok(!/souverain/i.test(vitrine), 'vitrine : pas de « souverain »');
ok(/mailto:institutions@labonnealerte\.fr/.test(vitrine) && /institutions@labonnealerte\.fr<\/a>/.test(vitrine), 'vitrine : contact institutions@labonnealerte.fr (mailto + texte)');
ok(!/contact@labonnealerte\.fr/.test(vitrine), 'vitrine : pas d’autre adresse de contact');
[['vitrine', vitrine], ['assistant', html]].forEach(function (p) {
  ok(!/<ADRESSE>|&lt;ADRESSE&gt;/.test(p[1]), p[0] + ' : aucun placeholder <ADRESSE> résiduel');
  ok(!/A CONFIRMER/.test(p[1]), p[0] + ' : aucun repère « A CONFIRMER » résiduel');
});
ok(!/Dahu-Concept/.test(vitrine) && /Dahu Concept/.test(vitrine), 'vitrine : éditeur écrit « Dahu Concept » (comme les mentions légales)');

// 7) Illustrations originales : SVG inline avec alternative accessible, image OG dédiée.
ok(/<svg[^>]*role="img"[^>]*aria-label=/.test(vitrine), 'vitrine : illustrations SVG avec aria-label');
ok(/og:image"\s+content="https:\/\/labonnealerte\.fr\/img\/og-institutions\.png"/.test(vitrine), 'vitrine : image OG dédiée (PNG 1200x630)');
ok(fs.existsSync(path.join(ROOT, 'public/img/og-institutions.png')), 'fichier image OG PNG présent');

// 8) FAQ sans script (details/summary natifs) — compatible CSP.
ok(/<details>[\s\S]*<summary>/.test(vitrine), 'vitrine : FAQ en <details>/<summary> (sans JS)');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
