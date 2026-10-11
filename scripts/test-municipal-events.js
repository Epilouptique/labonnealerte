// scripts/test-municipal-events.js — LOT B : logique des événements municipaux
// (server/orgs/lib/event-lifecycle.js). HORS DOM, hors réseau, hors base : modèles,
// statuts/transitions, droits par rôle, validation (champs obligatoires, cohérence des
// dates), expiration. Rejoue la séquence réelle brouillon → relecture/publié → annulé.
// Lancer : node scripts/test-municipal-events.js
'use strict';
const ev = require('../server/orgs/lib/event-lifecycle.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };
const okCat = (c) => ['coupures-eau', 'travaux-voirie', 'evenements-locaux', 'mairie'].includes(c);

console.log('TEST événements municipaux (lot B)');

// 1) Modèles
ok(ev.TEMPLATES.length === 5 && ev.isTemplate('coupure-eau') && ev.isTemplate('libre'), 'cinq modèles, dont coupure-eau et libre');
ok(!ev.isTemplate('spam'), 'modèle inconnu refusé');

// 1bis) Type d'événement (alerte / info)
ok(ev.KINDS.join(',') === 'alerte,info' && ev.isKind('alerte') && !ev.isKind('spam'), 'types : alerte / info');
ok(ev.canNotifyKind('alerte') && !ev.canNotifyKind('info'), 'seule « alerte » peut notifier');
ok(ev.validateEventInput({ template: 'libre', title: 'Info voirie', body: 'Texte suffisant ici.' }, {}).value.kind === 'info', 'kind défaut = info');
ok(ev.validateEventInput({ template: 'libre', kind: 'alerte', title: 'Coupure', body: 'Texte suffisant ici.' }, {}).value.kind === 'alerte', 'kind alerte conservé');
ok(!ev.validateEventInput({ template: 'libre', kind: 'urgent', title: 'X', body: 'Texte suffisant ici.' }, {}).ok, 'kind inconnu refusé');

// 2) Transitions
ok(ev.canTransitionEvent('draft', 'review') && ev.canTransitionEvent('draft', 'published') && ev.canTransitionEvent('draft', 'cancelled'), 'draft → review/published/cancelled');
ok(ev.canTransitionEvent('review', 'published') && ev.canTransitionEvent('review', 'draft'), 'review → published/draft');
ok(ev.canTransitionEvent('published', 'cancelled'), 'published → cancelled');
ok(!ev.canTransitionEvent('published', 'draft'), 'published → draft interdit');
ok(!ev.canTransitionEvent('cancelled', 'published'), 'annulé est terminal');
ok(ev.isEditable('draft') && ev.isEditable('review') && !ev.isEditable('published') && !ev.isEditable('cancelled'), 'éditable en draft/review seulement');

// 3) Droits par rôle
ok(ev.roleCan('editeur', 'create') && ev.roleCan('editeur', 'edit') && ev.roleCan('editeur', 'submit') && ev.roleCan('editeur', 'cancel'), 'éditeur : créer/éditer/soumettre/annuler');
ok(!ev.roleCan('editeur', 'publish'), 'éditeur : ne publie pas');
ok(ev.roleCan('admin', 'publish') && ev.canPublish('admin') && !ev.canPublish('editeur'), 'admin : publie');
ok(ev.publishTargetFor('admin') === 'published' && ev.publishTargetFor('editeur') === 'review', '« Publier » : admin→publié, éditeur→relecture');
ok(!ev.roleCan('visiteur', 'create'), 'rôle inconnu : aucun droit');

// 4) Validation — champs obligatoires
const base = { template: 'coupure-eau', title: 'Coupure secteur centre', body: 'Interruption de 8h à 12h, prévoyez une réserve.' };
ok(ev.validateEventInput(base, { isValidCategory: okCat }).ok, 'saisie minimale valide');
ok(!ev.validateEventInput({ ...base, title: 'ab' }, {}).ok, 'titre trop court refusé');
ok(!ev.validateEventInput({ ...base, body: 'court' }, {}).ok, 'texte trop court refusé');
ok(!ev.validateEventInput({ ...base, template: 'x' }, {}).ok, 'modèle inconnu refusé');
ok(ev.validateEventInput(base, {}).value.category === null, 'catégorie absente → null');
ok(!ev.validateEventInput({ ...base, category: 'inconnue' }, { isValidCategory: okCat }).ok, 'catégorie inconnue refusée');
ok(ev.validateEventInput({ ...base, category: 'coupures-eau' }, { isValidCategory: okCat }).value.category === 'coupures-eau', 'catégorie valide conservée');

// 5) Cohérence des dates
const withDates = (s, e) => ev.validateEventInput(Object.assign({}, base, { starts_at: s, ends_at: e }), {});
ok(withDates('2026-10-12T08:00', '2026-10-12T12:00').ok, 'fin après début → OK');
ok(!withDates('2026-10-12T12:00', '2026-10-12T08:00').ok, 'fin avant début → refus');
ok(!withDates('2026-10-12T08:00', '2026-10-12T08:00').ok, 'fin = début → refus');
ok(!ev.validateEventInput({ ...base, starts_at: 'pas-une-date' }, {}).ok, 'date invalide refusée');
ok(ev.validateEventInput(base, {}).value.starts_at === null, 'dates absentes → null');

// 6) Texte brut : contrôles retirés, sauts de ligne conservés
const v = ev.validateEventInput({ template: 'libre', title: 'Info', body: 'Ligne 1\nLigne 2\u0000 fin' }, {});
ok(v.ok && v.value.body.indexOf('\n') !== -1 && v.value.body.indexOf('\u0000') === -1, 'corps : \\n gardé, contrôle retiré');

// 7) Expiration (lecture publique)
const now = Date.parse('2026-10-11T10:00:00Z');
ok(ev.isLive({ status: 'published', ends_at: null }, now), 'publié sans fin → vivant');
ok(ev.isLive({ status: 'published', ends_at: '2026-10-11T12:00:00Z' }, now), 'publié, fin future → vivant');
ok(!ev.isLive({ status: 'published', ends_at: '2026-10-11T09:00:00Z' }, now), 'publié, fin passée → expiré');
ok(!ev.isLive({ status: 'draft', ends_at: null }, now), 'brouillon → pas vivant');

// 8) Séquence réelle rejouée : création éditeur → soumission → publication admin → annulation
let status = 'draft';
ok(ev.roleCan('editeur', 'create'), 'séquence : éditeur crée (draft)');
let t1 = ev.publishTargetFor('editeur'); ok(ev.canTransitionEvent(status, t1) && t1 === 'review', 'séquence : éditeur « Publier » → relecture'); status = t1;
let t2 = ev.publishTargetFor('admin'); ok(ev.canTransitionEvent(status, t2) && t2 === 'published', 'séquence : admin publie'); status = t2;
ok(ev.canTransitionEvent(status, 'cancelled'), 'séquence : annulation du publié'); status = 'cancelled';
ok(!ev.canTransitionEvent(status, 'published'), 'séquence : plus rien après annulation');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
