// scripts/test-publier-flow.js — LOT 9 : logique du parcours « Publier une alerte »
// (public/js/publier-flow.js), 2 écrans. HORS DOM, hors réseau : enchaînement des écrans,
// validations, suggestions de catégories par mots-clés, regroupement par famille, corps
// des requêtes. Lancer : node scripts/test-publier-flow.js
'use strict';
const F = require('../public/js/publier-flow.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

// Taxonomie minimale de test (slug/label/group), comme /api/categories.
const CATS = [
  { slug: 'gpu', label: 'Cartes graphiques', group: 'shopping' },
  { slug: 'high-tech', label: 'High-tech', group: 'shopping' },
  { slug: 'tech', label: 'Tech', group: 'tech-dev' },
  { slug: 'concerts', label: 'Concerts', group: 'billetterie-sorties' },
  { slug: 'meteo', label: 'Météo', group: 'meteo-risques' },
];

console.log('TEST parcours « Publier une alerte » (2 écrans)');

// 1) Écrans
ok(F.STEPS.join(',') === 'essentiel,details', 'deux écrans : essentiel → details');
ok(F.nextStep('essentiel') === 'details' && F.prevStep('details') === 'essentiel', 'navigation avant/arrière');
ok(F.progress('essentiel') === 50 && F.progress('details') === 100, 'barre de progression');

// 2) Titre (max 40)
ok(!F.validateTitle('ab').ok, 'titre trop court refusé');
ok(F.validateTitle('Baisse de prix RTX').ok, 'titre valide');
ok(!F.validateTitle('x'.repeat(41)).ok, 'titre > 40 refusé');
ok(F.TITLE_MAX === 40, 'max titre = 40');

// 3) Écran essentiel : titre + au moins une catégorie (jusqu'à 3)
ok(!F.canContinue('essentiel', { title: 'Baisse de prix RTX', categories: [] }), 'au moins une catégorie requise');
ok(F.canContinue('essentiel', { title: 'Baisse de prix RTX', categories: ['gpu'] }), 'titre + catégorie → OK');
ok(F.canContinue('essentiel', { title: 'Baisse de prix RTX', categories: ['gpu', 'high-tech', 'tech'] }), 'jusqu’à 3 catégories');
ok(!F.canContinue('essentiel', { title: 'Baisse de prix RTX', categories: ['a', 'b', 'c', 'd'] }), 'plus de 3 refusé');
ok(!F.canContinue('essentiel', { title: 'ab', categories: ['gpu'] }), 'titre invalide bloque');

// 4) Suggestions de catégories par mots-clés (sans IA)
const s1 = F.suggestCategories('Baisse de prix carte graphique RTX', CATS, 3).map((c) => c.slug);
ok(s1.indexOf('gpu') !== -1, 'suggestion : « carte graphique » → gpu');
ok(F.suggestCategories('Concert de rock à Lyon', CATS, 3).map((c) => c.slug).indexOf('concerts') !== -1, 'suggestion : « concert » → concerts');
ok(F.suggestCategories('', CATS, 3).length === 0, 'aucune suggestion sans titre');
ok(F.suggestCategories('Vigilance météo orange', CATS, 3).length <= 3, 'au plus 3 suggestions');

// 5) Regroupement par famille (liste déroulante)
const groups = F.groupedCategories(CATS);
const shopping = groups.filter((g) => g.group === 'shopping')[0];
ok(shopping && shopping.items.length === 2, 'famille shopping regroupe gpu + high-tech');
ok(groups.some((g) => g.group === 'tech-dev'), 'famille tech-dev présente');

// 6) Écran details : type + url (+ zone/perso/préavis)
ok(!F.canContinue('details', { type: 'page' }), 'url requise');
ok(F.canContinue('details', { type: 'page', url: 'https://x.fr/p' }), 'page + https → OK');
ok(!F.canContinue('details', { type: 'page', url: 'http://x.fr' }), 'non https refusé');
ok(F.canContinue('details', { type: 'page', url: 'https://x.fr', zone: '#prix' }), 'zone valide sur page');
ok(!F.canContinue('details', { type: 'rss', url: 'https://x.fr', zone: '#prix' }), 'zone interdite hors page');
ok(!F.canContinue('details', { type: 'agenda', url: 'https://x.fr', preavis: 99 }), 'préavis hors bornes refusé');
ok(!F.canContinue('details', { type: 'page', url: 'https://x.fr', alert_url: 'ftp://x' }), 'lien d\'alerte non http(s) refusé');

// 7) Corps de création : titre + catégories (jusqu'à 3) + type + url ENVOYÉS dès la création
const bodyPage = F.createBody({ type: 'page', url: ' https://x.fr/p ', zone: '#prix', title: ' Prix RTX ', categories: ['gpu', 'high-tech'], alert_message: 'Hop', alert_url: 'https://y.fr' });
ok(bodyPage.type === 'page' && bodyPage.url === 'https://x.fr/p' && bodyPage.zone === '#prix', 'createBody : type+url+zone');
ok(bodyPage.name === 'Prix RTX' && JSON.stringify(bodyPage.categories) === '["gpu","high-tech"]', 'createBody : titre + catégories multiples');
ok(bodyPage.alert_message === 'Hop' && bodyPage.alert_url === 'https://y.fr', 'createBody : personnalisation');
ok(JSON.stringify(F.createBody({ type: 'page', url: 'https://x', title: 'T', categories: ['a', 'b', 'c', 'd'] }).categories) === '["a","b","c"]', 'createBody : au plus 3 catégories');
const bodyAgenda = F.createBody({ type: 'agenda', url: 'https://x.fr/c.ics', title: 'Agenda club', categories: ['concerts'], preavis: 3 });
ok(bodyAgenda.preavis === 3 && bodyAgenda.zone === undefined, 'createBody : préavis agenda, pas de zone');
ok(F.createBody({ type: 'rss', url: 'https://x', title: 'Blog', categories: ['tech'], zone: '#x' }).zone === undefined, 'createBody : pas de zone hors page');

// 8) Invalidation de l'aperçu, erreurs, libellés
ok(F.invalidatesPreview('url') && F.invalidatesPreview('zone') && F.invalidatesPreview('type'), 'url/zone/type invalident l\'aperçu');
ok(!F.invalidatesPreview('title') && !F.invalidatesPreview('categories'), 'titre/catégories n\'invalident pas l\'aperçu');
ok(/déjà/.test(F.mapCreateError(409, { existing: { url: '/source/x/statut', name: 'X' } }).message), 'doublon → message');
ok(F.statusLabel('review') === 'En revue' && F.statusLabel('published') === 'Publiée', 'libellés statut');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
