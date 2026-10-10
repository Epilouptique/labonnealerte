// scripts/test-source-lifecycle-lot3.js — LOT 3 (qualité + signalements), logique PURE.
// Couvre : sélecteur de zone (validation + extraction + imbrication + auto-fermante),
// texte visible de zone, instabilité (hash qui diffère), validation personnalisation,
// préavis borné, motifs de signalement + règles de suspension auto, détection de doublons.
// Aucun réseau. Lancer : node scripts/test-source-lifecycle-lot3.js
'use strict';
const lc = require('../server/sources/lib/source-lifecycle');
const pz = require('../server/sources/lib/page-zone');
const { hashHtml } = require('../server/sources/lib/hash-diff-html');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST LOT 3 — qualité & signalements');

// 1) Validation de sélecteur
ok(pz.isValidSelector('article'), 'sélecteur balise valide');
ok(pz.isValidSelector('#prix'), 'sélecteur #id valide');
ok(pz.isValidSelector('.tarif'), 'sélecteur .classe valide');
ok(pz.isValidSelector('div#contenu'), 'sélecteur balise#id valide');
ok(pz.isValidSelector('span.badge'), 'sélecteur balise.classe valide');
ok(!pz.isValidSelector('div > p'), 'combinateur refusé');
ok(!pz.isValidSelector('a[href]'), 'attribut refusé');
ok(!pz.isValidSelector('p:first-child'), 'pseudo-classe refusée');
ok(!pz.isValidSelector(''), 'sélecteur vide refusé');
ok(!pz.isValidSelector('x'.repeat(70)), 'sélecteur trop long refusé');

// 2) Extraction de zone
const html = '<html><body><h1>Titre</h1><div id="prix">99 €<span class="old">anc</span></div><div class="tarif">A<div class="tarif">B</div></div><img id="logo"/></body></html>';
ok(pz.extractZone(html, '#prix').includes('99'), 'extractZone #prix → contenu');
ok(/A.*B/s.test(pz.extractZone(html, '.tarif')), 'extractZone .tarif → gère l\'imbrication de même classe');
ok(pz.extractZone(html, 'h1') === 'Titre', 'extractZone balise → inner exact');
ok(pz.extractZone(html, '#absent') === null, 'extractZone zone absente → null');
ok(pz.extractZone(html, '#logo') === '', 'extractZone balise auto-fermante → ""');

// 3) Texte visible de zone (aperçu auteur)
const zv = pz.zoneVisibleText(html, '#prix');
ok(zv.found && /99/.test(zv.text) && !/<span/.test(zv.text), 'zoneVisibleText → texte visible sans balises');
ok(pz.zoneVisibleText(html, '#absent').found === false, 'zoneVisibleText zone absente → found=false');
ok(pz.zoneVisibleText(html, null).found === true, 'zoneVisibleText sans sélecteur → page entière');

// 4) Instabilité : deux rendus donnant des hash différents
const a = hashHtml('<p>prix 10</p>').hash;
const b = hashHtml('<p>prix 20</p>').hash;
ok(a !== b, 'contenu différent → hash différent (instable)');
ok(hashHtml('<p>stable</p>').hash === hashHtml('<p>stable</p>').hash, 'contenu identique → hash identique (stable)');
// Dénoisage des dates : un horodatage qui change ne doit PAS casser le hash
ok(hashHtml('<p>Mis à jour 10:30</p>').hash === hashHtml('<p>Mis à jour 11:45</p>').hash, 'dates/heures neutralisées → hash stable');

// 5) Personnalisation
let p = lc.validatePersonalization({ alert_message: 'Prix changé !', alert_url: 'https://x.fr/p' });
ok(p.ok && p.value.message === 'Prix changé !' && p.value.url === 'https://x.fr/p', 'personnalisation valide');
ok(lc.validatePersonalization({}).ok, 'personnalisation vide OK (optionnelle)');
ok(!lc.validatePersonalization({ alert_url: 'ftp://x' }).ok, 'lien non http(s) refusé');
ok(!lc.validatePersonalization({ alert_message: 'x'.repeat(281) }).ok, 'message trop long refusé');
ok(lc.validatePersonalization({ alert_message: 'a\u0000b' }).value.message === 'a b', 'caractères de contrôle nettoyés');

// 6) Préavis borné
ok(lc.clampPreavis(undefined) === 1, 'préavis défaut = 1');
ok(lc.clampPreavis('7') === 7, 'préavis 7 conservé');
ok(lc.clampPreavis(999) === 30, 'préavis plafonné à 30');
ok(lc.clampPreavis(-5) === 0, 'préavis plancher à 0');
ok(lc.engineParams('veille-agenda', 'https://x/c.ics', { preavis: 500 }).preavis === '30', 'engineParams agenda applique le plafond');
ok(lc.engineParams('veille-page', 'https://x', { zone: '#prix' }).zone === '#prix', 'engineParams page transmet la zone');

// 7) Signalements : motifs + suspension auto
ok(lc.isValidReportReason('spam-bruit') && lc.isValidReportReason('doublon'), 'motifs valides reconnus');
ok(!lc.isValidReportReason('autre-chose'), 'motif hors liste refusé');
ok(lc.REPORT_REASONS.length === 5, 'liste fermée de 5 motifs');
const T = lc.REPORT_SUSPEND_THRESHOLD;
ok(lc.shouldAutoSuspend({ badge: 'community', status: 'published', distinctReports: T }), 'community publiée au seuil → suspension');
ok(!lc.shouldAutoSuspend({ badge: 'community', status: 'published', distinctReports: T - 1 }), 'sous le seuil → pas de suspension');
ok(!lc.shouldAutoSuspend({ badge: 'official', status: 'published', distinctReports: T + 5 }), 'source OFFICIELLE jamais suspendue auto');
ok(!lc.shouldAutoSuspend({ badge: 'verified', status: 'published', distinctReports: T + 5 }), 'source vérifiée jamais suspendue auto');
ok(!lc.shouldAutoSuspend({ badge: 'community', status: 'suspended', distinctReports: T + 5 }), 'déjà non publiée → pas de rebascule');

// 8) Doublons : normalisation d'URL
const base = lc.normalizeUrl('https://www.Exemple.fr/page/');
ok(lc.normalizeUrl('http://exemple.fr/page') === base, 'schéma + www + slash final ignorés');
ok(lc.normalizeUrl('https://exemple.fr/page?utm_source=x&a=1') === lc.normalizeUrl('https://exemple.fr/page?a=1'), 'paramètres de tracking retirés');
ok(lc.normalizeUrl('https://exemple.fr/page?b=2&a=1') === lc.normalizeUrl('https://exemple.fr/page?a=1&b=2'), 'ordre des paramètres indifférent');
ok(lc.normalizeUrl('https://exemple.fr/autre') !== base, 'chemin différent → non doublon');
ok(lc.normalizeUrl('ftp://x') === null, 'protocole non http(s) → null');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
