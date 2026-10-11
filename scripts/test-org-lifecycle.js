// scripts/test-org-lifecycle.js — LOT A : logique des ORGANISATIONS (org-lifecycle.js).
// HORS DOM, hors réseau, hors base : statuts/transitions, droits membres, validation de
// création (type commune/epci/autre, INSEE/SIREN, e-mail, justificatif), quotas, doublons.
// Lancer : node scripts/test-org-lifecycle.js
'use strict';
const ol = require('../server/orgs/lib/org-lifecycle.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

console.log('TEST cycle de vie des organisations (lot A)');

// 1) Transitions (acteur admin uniquement)
ok(ol.canTransitionOrg('pending', 'verified', 'admin'), 'pending → verified (admin)');
ok(ol.canTransitionOrg('pending', 'suspended', 'admin'), 'pending → suspended (refus, admin)');
ok(ol.canTransitionOrg('verified', 'suspended', 'admin'), 'verified → suspended (admin)');
ok(ol.canTransitionOrg('suspended', 'verified', 'admin'), 'suspended → verified (réhabilitation)');
ok(!ol.canTransitionOrg('pending', 'verified', 'author'), 'un non-admin ne peut pas vérifier');
ok(!ol.canTransitionOrg('verified', 'pending', 'admin'), 'pas de retour verified → pending');
ok(!ol.canTransitionOrg('pending', 'pending', 'admin'), 'pas de transition identité');
ok(ol.transitionNeedsReason('suspended') && !ol.transitionNeedsReason('verified'), 'motif requis pour suspension, pas pour vérification');

// 2) Droits membres : seul admin + actif gère
ok(ol.canManageMembers({ role: 'admin', status: 'actif' }), 'admin actif : gère');
ok(!ol.canManageMembers({ role: 'admin', status: 'invite' }), 'admin invité (non actif) : ne gère pas');
ok(!ol.canManageMembers({ role: 'editeur', status: 'actif' }), 'editeur actif : ne gère pas');
ok(!ol.canManageMembers(null), 'non membre : ne gère pas');
ok(ol.isValidRole('admin') && ol.isValidRole('editeur') && !ol.isValidRole('root'), 'rôles valides');

// 3) Identifiants
ok(ol.isInsee('05061') && ol.isInsee('2A004') && !ol.isInsee('5061') && !ol.isInsee('ABCDE'), 'INSEE (Corse incluse)');
ok(ol.isSiren('123456789') && ol.isSiren('123 456 789') && !ol.isSiren('12345'), 'SIREN 9 chiffres (espaces tolérés)');
ok(ol.emailDomain('Agent@Mairie-Gap.FR') === 'mairie-gap.fr', 'domaine e-mail normalisé');
ok(ol.emailDomain('pasunemail') === null, 'domaine : e-mail invalide → null');

// 4) Validation de création — commune (INSEE résolu par la route)
const base = { name: 'Mairie de Gap', type: 'commune', role: 'admin', email: 'contact@ville-gap.fr' };
ok(ol.validateCreate(base, '05061').ok, 'commune valide (INSEE résolu)');
ok(ol.validateCreate(base, '05061').value.commune_insee === '05061', 'INSEE porté dans value');
ok(!ol.validateCreate(base, null).ok, 'commune sans INSEE résolu → refus');
ok(!ol.validateCreate({ ...base, name: 'ab' }, '05061').ok, 'nom trop court refusé');
ok(!ol.validateCreate({ ...base, role: 'root' }, '05061').ok, 'rôle invalide refusé');
ok(!ol.validateCreate({ ...base, email: 'nope' }, '05061').ok, 'e-mail invalide refusé');
ok(!ol.validateCreate({ ...base, type: 'pays' }, '05061').ok, 'type hors liste refusé');

// 5) Validation — EPCI/autre (SIREN requis, pas d'INSEE)
const epci = { name: 'ComCom Buëch-Dévoluy', type: 'epci', role: 'editeur', email: 'dir@ccbd.fr', siren: '200040715' };
const vE = ol.validateCreate(epci, null);
ok(vE.ok && vE.value.siren === '200040715' && vE.value.commune_insee === null, 'EPCI valide par SIREN');
ok(!ol.validateCreate({ ...epci, siren: '12' }, null).ok, 'EPCI sans SIREN valide → refus');

// 6) Justificatif facultatif + bornes
ok(ol.validateCreate({ ...base, justification: '' }, '05061').value.justification == null, 'justificatif vide → null');
ok(ol.validateCreate({ ...base, justification: 'Arrêté municipal n°12' }, '05061').value.justification === 'Arrêté municipal n°12', 'justificatif conservé (nettoyé)');
ok(!ol.validateCreate({ ...base, justification: 'x'.repeat(501) }, '05061').ok, 'justificatif > 500 refusé');
ok(ol.validateCreate({ ...base, justification: 'a\u0000b\tc' }, '05061').value.justification === 'a b c', 'justificatif : contrôles assainis');

// 7) Quotas
ok(ol.checkOrgQuota({ activeCount: 0 }).ok, 'quota : 0 organisation → OK');
ok(!ol.checkOrgQuota({ activeCount: ol.MAX_ORGS_PER_ACCOUNT }).ok, 'quota : plafond atteint → refus');
ok(ol.MAX_ORGS_PER_ACCOUNT >= 1 && ol.CREATE_MAX >= 1, 'bornes de quota/fréquence définies');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
