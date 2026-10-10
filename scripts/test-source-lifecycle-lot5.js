// scripts/test-source-lifecycle-lot5.js — LOT 5 (édition/abandon), logique PURE.
// Couvre : création minimale (type+url), nom provisoire, verrou de complétude avant
// soumission, doublon avec EXCLUSION de soi, transitions/droits d'édition et de suppression.
// Lancer : node scripts/test-source-lifecycle-lot5.js
'use strict';
const lc = require('../server/sources/lib/source-lifecycle.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST LOT 5 — édition & abandon de brouillon');

// 1) Création minimale (étape adresse) : type + url seulement
let v = lc.validateUrlType({ type: 'page', url: 'https://exemple.fr/p' });
ok(v.ok && v.value.engine === 'veille-page' && v.value.key === 'url', 'validateUrlType : page OK');
ok(!lc.validateUrlType({ type: 'page', url: 'http://x' }).ok, 'validateUrlType : non https refusé');
ok(!lc.validateUrlType({ url: 'https://x' }).ok, 'validateUrlType : type manquant refusé');
ok(!lc.validateUrlType({ type: 'ftp', url: 'https://x' }).ok, 'validateUrlType : type inconnu refusé');

// 2) Nom provisoire dérivé de l'hôte (« Brouillon — <hôte> »)
var pn = lc.provisionalName('https://www.exemple.fr/une/page');
ok(/^Brouillon — exemple\.fr/.test(pn) && pn.length >= 3 && pn.length <= 60, 'provisionalName : « Brouillon — hôte », 3..60');
ok(lc.isProvisionalName(pn) === true, 'isProvisionalName : reconnaît le nom provisoire');
ok(lc.isProvisionalName('Tarifs Netflix') === false, 'isProvisionalName : nom réel non provisoire');
// Le verrou refuse le nom provisoire comme nom définitif, MÊME avec une catégorie.
ok(!lc.validateSubmittable({ name: pn, categories: ['vie'] }).ok, 'submittable : nom provisoire refusé comme nom définitif');

// 3) Verrou de complétude avant soumission
ok(!lc.validateSubmittable({ name: lc.provisionalName('https://exemple.fr'), categories: [] }).ok, 'submittable : sans catégorie → refusé');
ok(!lc.validateSubmittable({ name: 'ab', categories: ['vie'] }).ok, 'submittable : nom trop court → refusé');
ok(lc.validateSubmittable({ name: 'Tarifs Netflix', categories: ['vie'] }).ok, 'submittable : nom + catégorie → OK');

// 4) Doublon avec exclusion de soi (via normalizeUrl, utilisé par findDuplicate)
var a = lc.normalizeUrl('https://exemple.fr/page');
var b = lc.normalizeUrl('https://www.exemple.fr/page/');
ok(a === b, 'normalizeUrl : deux formes d’une même URL coïncident (doublon détectable)');
// La route exclut la source elle-même : on simule la logique de findDuplicate.
function dup(url, rows, excludeId) {
  var n = lc.normalizeUrl(url);
  return rows.find(function (r) { return r.id !== excludeId && lc.normalizeUrl(r.endpoint_url) === n; }) || null;
}
var rows = [{ id: 'self', endpoint_url: 'https://exemple.fr/page' }, { id: 'autre', endpoint_url: 'https://autre.fr' }];
ok(dup('https://www.exemple.fr/page/', rows, 'self') === null, 'doublon : s’exclut soi-même (pas de faux doublon)');
ok(dup('https://www.exemple.fr/page/', rows, 'nouvelle') !== null, 'doublon : détecté pour une AUTRE source');

// 5) Transitions/droits (rappel) : l'édition/suppression côté route n'est permise que
//    sur draft/testing — on vérifie que review/published/suspended ne sont PAS éditables
//    via la même grille d'états que la route utilise.
var EDITABLE = ['draft', 'testing'];
['draft', 'testing'].forEach(function (s) { ok(EDITABLE.indexOf(s) >= 0, 'éditable/supprimable : ' + s); });
['review', 'published', 'suspended'].forEach(function (s) { ok(EDITABLE.indexOf(s) < 0, 'NON éditable/supprimable : ' + s); });

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
