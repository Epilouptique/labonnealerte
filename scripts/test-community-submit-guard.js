// scripts/test-community-submit-guard.js — LOT 11 : aperçu obligatoire avant soumission.
// Logique PURE (hors DOM, hors réseau, hors base) : le verrou de /submit exige un aperçu
// RÉUSSI récent correspondant à l'URL et à la zone actuelles ; un aperçu en erreur HTTP,
// un flux vide ou un XML invalide ne comptent jamais comme réussis ; message d'échec clair.
// Lancer : node scripts/test-community-submit-guard.js
'use strict';
const lc = require('../server/sources/lib/source-lifecycle.js');
const { parseFeed } = require('../server/sources/lib/feed-parser.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

const URL1 = 'https://next.ink/rss/news.xml';
const URL2 = 'https://autre.fr/flux.xml';
const now = Date.now();
// Marquage d'un aperçu réussi, tel que la route l'écrit dans engine_config.
const okMark = (url, zone, at) => ({ preview_ok_at: new Date(at == null ? now : at).toISOString(), preview_url: url, preview_zone: zone || null });

console.log('TEST verrou d’aperçu avant soumission (lot 11)');

// 1) Soumission SANS aperçu → refusée (aucun marquage).
ok(!lc.previewSatisfiesSubmit({}, URL1, null), 'sans aperçu : soumission refusée');
ok(!lc.previewSatisfiesSubmit({ last_extract: 'x', last_extract_at: new Date(now).toISOString() }, URL1, null),
  'un extrait sans preview_ok_at ne suffit pas (ancien état testing)');

// 2) Aperçu en ÉCHEC puis soumission → refusée.
//    Un aperçu en échec n'écrit PAS preview_ok_at ; la config reste sans marquage.
const afterFailedPreview = {}; // la route retourne ok:false avant d'écrire le marquage
ok(!lc.previewSatisfiesSubmit(afterFailedPreview, URL1, null), 'aperçu en échec : soumission refusée');

// 3) Changement d'URL puis soumission → refusée.
//    a) marquage présent pour l'ancienne URL, l'URL courante a changé.
ok(lc.previewSatisfiesSubmit(okMark(URL1, null), URL1, null), 'aperçu réussi correspondant → autorisé');
ok(!lc.previewSatisfiesSubmit(okMark(URL1, null), URL2, null), 'URL changée depuis l’aperçu → refusée');
//    b) PATCH efface le marquage sur changement d'URL/zone.
const cfgPatched = okMark(URL1, null);
lc.PREVIEW_MARK_KEYS.forEach((k) => { delete cfgPatched[k]; });
ok(!lc.previewSatisfiesSubmit(cfgPatched, URL2, null), 'marquage effacé par PATCH (URL/zone) → refusée');

// 4) Zone : l'aperçu doit correspondre à la zone actuelle.
ok(lc.previewSatisfiesSubmit(okMark('https://x.fr/p', '#prix'), 'https://x.fr/p', '#prix'), 'zone identique → autorisé');
ok(!lc.previewSatisfiesSubmit(okMark('https://x.fr/p', '#prix'), 'https://x.fr/p', '#promo'), 'zone changée → refusée');
ok(!lc.previewSatisfiesSubmit(okMark('https://x.fr/p', null), 'https://x.fr/p', '#prix'), 'zone ajoutée après aperçu → refusée');

// 5) Fraîcheur : un aperçu périmé ne vaut plus.
ok(!lc.previewSatisfiesSubmit(okMark(URL1, null, now - lc.PREVIEW_TTL_MS - 60_000), URL1, null), 'aperçu périmé → refusé');
ok(lc.previewSatisfiesSubmit(okMark(URL1, null, now - 60_000), URL1, null), 'aperçu récent → autorisé');
ok(!lc.previewSatisfiesSubmit({ preview_ok_at: 'pas-une-date', preview_url: URL1, preview_zone: null }, URL1, null), 'horodatage invalide → refusé');
ok(lc.PREVIEW_TTL_MS >= 60_000, 'fenêtre d’aperçu bornée (≥ 1 min)');

// 6) Un flux en erreur HTTP / vide / illisible ne compte jamais comme réussi.
//    parseFeed ne jette pas : XML invalide ou vide → aucun item (la route renvoie ok:false).
ok(parseFeed('').items.length === 0, 'flux vide → aucun item (aperçu non réussi)');
ok(parseFeed('<html><body>404 Not Found</body></html>').items.length === 0, 'page 404/HTML → aucun item (aperçu non réussi)');
ok(parseFeed('<rss><channel><item><title>A</title></item></channel></rss>').items.length === 1, 'RSS valide → 1 item');

// 7) Message d'aperçu en échec : code HTTP reçu + aide.
const m404 = lc.previewErrorMessage('Réponse HTTP 404');
ok(/404/.test(m404) && /robots/i.test(m404), '404 : message affiche le code + aide robots');
ok(/503/.test(lc.previewErrorMessage('Réponse HTTP 503')), '503 : code repris dans le message');
const mGen = lc.previewErrorMessage('Nom de domaine introuvable (DNS)');
ok(/DNS/.test(mGen) && /lien du flux/i.test(mGen), 'erreur non HTTP : message + aide lien');
ok(/injoignable|invalide/i.test(lc.previewErrorMessage('')), 'message vide → repli générique');

// 8) Transition : seul testing→review (auteur) ; le verrou d'aperçu s'ajoute par-dessus.
ok(lc.canTransition('testing', 'review', 'author'), 'testing→review autorisé (auteur)');
ok(!lc.canTransition('draft', 'review', 'author'), 'draft→review interdit (aperçu/promotion requis)');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
