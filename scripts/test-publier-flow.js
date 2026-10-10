// scripts/test-publier-flow.js — LOT 4 : logique du parcours « Publier une alerte »
// (public/js/publier-flow.js). HORS DOM, hors réseau. Couvre l'enchaînement des étapes,
// les validations, le gating du bouton Continuer, les droits/erreurs, les libellés.
// Lancer : node scripts/test-publier-flow.js
'use strict';
const F = require('../public/js/publier-flow.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST parcours « Publier une alerte »');

// 1) Ordre des étapes (adresse → aperçu → présentation, grâce au brouillon minimal)
ok(F.STEPS.join(',') === 'type,adresse,apercu,presentation,recap', 'ordre des étapes correct');
ok(F.nextStep('adresse') === 'apercu' && F.nextStep('apercu') === 'presentation', 'adresse → aperçu → présentation');
ok(F.nextStep('type') === 'adresse' && F.prevStep('adresse') === 'type', 'navigation avant/arrière');
ok(F.prevStep('type') === 'type' && F.nextStep('recap') === 'recap', 'bornes d\'étapes');
ok(F.progress('type') === 20 && F.progress('recap') === 100, 'barre de progression');

// 2) Étape type
ok(!F.canContinue('type', {}), 'type : rien choisi → bloqué');
ok(F.canContinue('type', { type: 'page' }), 'type : page → OK');
ok(!F.canContinue('type', { type: 'ftp' }), 'type inconnu → bloqué');

// 3) Étape adresse (+ zone)
ok(F.canContinue('adresse', { type: 'page', url: 'https://x.fr/p' }), 'adresse https valide');
ok(!F.canContinue('adresse', { type: 'page', url: 'http://x.fr' }), 'adresse non https refusée');
ok(F.canContinue('adresse', { type: 'page', url: 'https://x.fr', zone: '#prix' }), 'zone valide sur page');
ok(!F.canContinue('adresse', { type: 'page', url: 'https://x.fr', zone: 'div > p' }), 'zone invalide refusée');
ok(!F.canContinue('adresse', { type: 'rss', url: 'https://x.fr', zone: '#prix' }), 'zone interdite hors page');

// 4) Étape présentation
const okPres = { name: 'Tarifs Netflix', categories: ['vie-quotidienne'], type: 'page' };
ok(F.canContinue('presentation', okPres), 'présentation valide');
ok(!F.canContinue('presentation', { name: 'ab', categories: ['x'] }), 'nom trop court refusé');
ok(!F.canContinue('presentation', { name: 'Nom', categories: [] }), 'au moins une catégorie requise');
ok(!F.canContinue('presentation', { name: 'Nom', categories: ['a', 'b', 'c', 'd'] }), 'max 3 catégories');
ok(!F.canContinue('presentation', Object.assign({}, okPres, { alert_url: 'ftp://x' })), 'lien d\'alerte non http(s) refusé');
ok(!F.canContinue('presentation', Object.assign({}, okPres, { type: 'agenda', preavis: 99 })), 'préavis hors bornes refusé');
ok(F.canContinue('presentation', Object.assign({}, okPres, { type: 'agenda', preavis: 3 })), 'préavis valide');

// 5) Étape aperçu : gating sur previewOk
ok(!F.canContinue('apercu', { previewOk: false }), 'aperçu non lancé → Continuer bloqué');
ok(F.canContinue('apercu', { previewOk: true }), 'aperçu réussi → Continuer autorisé');

// 6) Invalidation de l'aperçu quand l'adresse/zone/type change
ok(F.invalidatesPreview('url') && F.invalidatesPreview('zone') && F.invalidatesPreview('type'), 'url/zone/type invalident l\'aperçu');
ok(!F.invalidatesPreview('name') && !F.invalidatesPreview('categories'), 'nom/catégories n\'invalident pas l\'aperçu');

// 7) Erreurs de création
let m = F.mapCreateError(409, { existing: { id: 'x', name: 'Veille X', url: '/source/x/statut' } });
ok(/déjà/.test(m.message) && m.link === '/source/x/statut', 'doublon → message + lien vers la source');
ok(/atteinte/i.test(F.mapCreateError(409, { error: 'Limite atteinte : 5…' }).message), 'quota → message');
ok(F.mapCreateError(400, { error: 'URL refusée' }).message === 'URL refusée', 'URL refusée → message serveur');
ok(/[Cc]onnexion/.test(F.mapCreateError(401, {}).message), '401 → connexion requise');

// 8) Corps de création MINIMAL (étape adresse) + PATCH présentation/adresse
const body = F.createBody({ type: 'page', url: ' https://x.fr/p ', zone: '#prix', name: 'Nom', categories: ['a'] });
ok(body.type === 'page' && body.url === 'https://x.fr/p' && body.zone === '#prix', 'createBody minimal : type+url+zone');
ok(body.name === undefined && body.categories === undefined, 'createBody minimal : pas de nom/catégories');
ok(F.createBody({ type: 'rss', url: 'https://x', zone: '#x' }).zone === undefined, 'createBody : pas de zone hors page');
const pb = F.presentationBody({ type: 'agenda', name: ' Nom ', categories: ['a', 'b'], alert_message: 'Hop', alert_url: 'https://y.fr', preavis: 4 });
ok(pb.name === 'Nom' && pb.categories.length === 2 && pb.alert_message === 'Hop' && pb.alert_url === 'https://y.fr' && pb.preavis === 4, 'presentationBody : champs présentation + préavis');
const abp = F.addressBody({ type: 'page', url: ' https://z.fr ', zone: '.t' });
ok(abp.url === 'https://z.fr' && abp.zone === '.t', 'addressBody : url + zone (page)');
ok(F.addressBody({ type: 'rss', url: 'https://z.fr' }).zone === undefined, 'addressBody : pas de zone hors page');

// 9) Libellés de statut (Mes publications)
ok(F.statusLabel('draft') === 'Brouillon' && F.statusLabel('testing') === 'À tester', 'libellés draft/testing');
ok(F.statusLabel('review') === 'En revue' && F.statusLabel('published') === 'Publiée', 'libellés review/published');
ok(F.statusLabel('suspended', 'abus') === 'Suspendue — abus', 'libellé suspended + motif');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
