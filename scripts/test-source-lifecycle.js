// scripts/test-source-lifecycle.js — LOT 2 : logique du cycle de vie (HORS réseau/base).
// Couvre : transitions valides/invalides + acteur (auteur vs admin), droits de
// propriété, quotas (COUNT), validation de création (params obligatoires par type),
// params d'exécution par moteur, construction de source déléguée (dry-run).
// Lancer : node scripts/test-source-lifecycle.js
'use strict';
const lc = require('../server/sources/lib/source-lifecycle');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST cycle de vie des sources communautaires');

// 1) Transitions autorisées + acteur
ok(lc.canTransition('draft', 'testing', 'author'), 'draft→testing (auteur)');
ok(!lc.canTransition('draft', 'testing', 'admin'), 'draft→testing refusé à l\'admin (c\'est une action auteur)');
ok(lc.canTransition('testing', 'review', 'author'), 'testing→review (auteur)');
ok(lc.canTransition('review', 'published', 'admin'), 'review→published (admin)');
ok(!lc.canTransition('review', 'published', 'author'), 'review→published INTERDIT à l\'auteur');
ok(lc.canTransition('review', 'draft', 'admin'), 'review→draft (refus admin)');
ok(lc.canTransition('published', 'suspended', 'admin'), 'published→suspended (admin)');
ok(lc.canTransition('suspended', 'published', 'admin'), 'suspended→published (admin)');

// 2) Transitions invalides
ok(!lc.canTransition('draft', 'published', 'admin'), 'draft→published interdit (saut)');
ok(!lc.canTransition('draft', 'review', 'author'), 'draft→review interdit (aperçu requis d\'abord)');
ok(!lc.canTransition('testing', 'published', 'admin'), 'testing→published interdit');
ok(!lc.canTransition('published', 'draft', 'admin'), 'published→draft interdit');
ok(!lc.canTransition('suspended', 'suspended', 'admin'), 'suspended→suspended interdit');
ok(!lc.canTransition('draft', 'inconnu', 'author'), 'statut cible inconnu interdit');

// 3) Droits de propriété : un compte n'agit que sur ses sources
ok(lc.isOwner({ author_subscriber_id: 7 }, 7), 'propriétaire reconnu');
ok(!lc.isOwner({ author_subscriber_id: 7 }, 9), 'non-propriétaire rejeté');
ok(!lc.isOwner({ author_subscriber_id: null }, 9), 'source sans auteur → pas de propriétaire');
ok(!lc.isOwner(null, 9), 'source absente → pas de propriétaire');

// 4) Quotas
ok(lc.checkQuota({ unpublished: 0, total: 0 }).ok, 'quota : compte vide OK');
ok(lc.checkQuota({ unpublished: lc.MAX_UNPUBLISHED - 1, total: 2 }).ok, 'quota : sous la limite non publiées OK');
const qU = lc.checkQuota({ unpublished: lc.MAX_UNPUBLISHED, total: 2 });
ok(!qU.ok && /non publiées/.test(qU.error), 'quota : limite non publiées → message clair');
const qT = lc.checkQuota({ unpublished: 0, total: lc.MAX_TOTAL });
ok(!qT.ok && /maximum/.test(qT.error), 'quota : limite totale → message clair');

// 5) Validation de création — params obligatoires par type
let v = lc.validateCreate({ type: 'page', url: 'https://exemple.fr/page', name: 'Veille tarifs', description: 'Surveille la page des tarifs de X.' });
ok(v.ok && v.value.engine === 'veille-page' && v.value.key === 'url', 'création page → engine veille-page, clé url');
v = lc.validateCreate({ type: 'rss', url: 'https://exemple.fr/flux.xml', name: 'Veille blog', description: 'Nouveaux articles du blog.' });
ok(v.ok && v.value.engine === 'veille-rss' && v.value.key === 'flux', 'création rss → engine veille-rss, clé flux');
v = lc.validateCreate({ type: 'agenda', url: 'https://exemple.fr/cal.ics', name: 'Agenda club', description: 'Nouveaux évènements du club.' });
ok(v.ok && v.value.engine === 'veille-agenda' && v.value.key === 'agenda', 'création agenda → engine veille-agenda, clé agenda');
ok(!lc.validateCreate({ type: 'ftp', url: 'https://x.fr', name: 'n', description: 'desc assez longue ici' }).ok, 'type inconnu refusé');
ok(!lc.validateCreate({ type: 'page', url: 'http://x.fr', name: 'Nom', description: 'desc assez longue ici' }).ok, 'URL non https refusée');
ok(!lc.validateCreate({ type: 'page', url: 'https://x.fr', name: 'ab', description: 'desc assez longue ici' }).ok, 'nom trop court refusé');
ok(!lc.validateCreate({ type: 'page', url: 'https://x.fr', name: 'Nom valide', description: 'court' }).ok, 'description trop courte refusée');

// 6) Params d'exécution par moteur
ok(lc.engineParams('veille-page', 'https://x.fr').url === 'https://x.fr', 'engineParams veille-page → {url}');
ok(lc.engineParams('veille-rss', 'https://x.fr/f').flux === 'https://x.fr/f', 'engineParams veille-rss → {flux}');
const ag = lc.engineParams('veille-agenda', 'https://x.fr/c.ics');
ok(ag.agenda === 'https://x.fr/c.ics' && ag.preavis === '1', 'engineParams veille-agenda → {agenda, preavis:1}');
ok(lc.engineParams('inconnu', 'https://x.fr') === null, 'engineParams moteur inconnu → null');

// 7) buildEngineSource (dry-run) — module injecté, aucun réseau
let calledWith = null;
const fakeReq = (p) => ({ checkWithParams: async (list) => { calledWith = { p, list }; return [{ state: 'active', message: 'ok', url: 'https://x.fr' }]; } });
const src = lc.buildEngineSource({ id: 'v1', engine: 'veille-page', endpoint_url: 'https://x.fr' }, fakeReq);
ok(src && typeof src.check === 'function', 'buildEngineSource → objet { check }');
(async () => {
  const r = await src.check();
  ok(r.state === 'active' && calledWith.list[0].url === 'https://x.fr', 'check délègue au module avec les bons params');
  ok(lc.buildEngineSource({ id: 'v2', engine: 'external', endpoint_url: 'https://x' }, fakeReq) === null, 'moteur hors veille-* → null (géré ailleurs)');
  ok(lc.buildEngineSource({ id: 'v3', engine: 'veille-page', endpoint_url: '' }, fakeReq) === null, 'URL absente → null');

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
