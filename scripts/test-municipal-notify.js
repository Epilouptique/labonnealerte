// scripts/test-municipal-notify.js — LOT C : logique de diffusion (notify-lifecycle.js).
// HORS DOM, hors réseau, AUCUN envoi : interrupteur global, fenêtre d'annulation/échéance,
// idempotence + renvoi unique, plafonds, destinataires en zone, événement expiré.
// Lancer : node scripts/test-municipal-notify.js
'use strict';
const nl = require('../server/orgs/lib/notify-lifecycle.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

const NOW = Date.parse('2026-10-11T10:00:00Z');
const pub = (over) => Object.assign({ status: 'published', kind: 'alerte', ends_at: null, notify_status: 'none', notify_resends: 0, commune_insee: '05061' }, over || {});

console.log('TEST diffusion événements municipaux (lot C)');

// 1) Interrupteur global (défaut faux via env non positionné dans ce test)
delete process.env.MUNICIPAL_NOTIFY_ENABLED;
ok(!nl.notifyEnabled(), 'interrupteur global : défaut désactivé');
process.env.MUNICIPAL_NOTIFY_ENABLED = 'true'; ok(nl.notifyEnabled(), 'interrupteur : "true" active');
process.env.MUNICIPAL_NOTIFY_ENABLED = 'yes'; ok(!nl.notifyEnabled(), 'interrupteur : seule la valeur "true" compte');
delete process.env.MUNICIPAL_NOTIFY_ENABLED;

// 2) Éligibilité (publié + vivant)
ok(nl.isNotifiable(pub(), NOW), 'publié sans fin → notifiable');
ok(nl.isNotifiable(pub({ ends_at: '2026-10-11T12:00:00Z' }), NOW), 'publié, fin future → notifiable');
ok(!nl.isNotifiable(pub({ ends_at: '2026-10-11T09:00:00Z' }), NOW), 'publié, fin passée → non notifiable');
ok(!nl.isNotifiable(pub({ status: 'draft' }), NOW), 'brouillon → non notifiable');

// 3) Idempotence + renvoi unique
ok(nl.canSchedule(pub(), NOW).ok, 'première programmation autorisée');
ok(!nl.canSchedule(pub({ notify_status: 'scheduled' }), NOW).ok, 'déjà programmé → refus');
ok(!nl.canSchedule(pub({ notify_status: 'sent' }), NOW).ok, 'déjà envoyé → refus (hors renvoi)');
ok(nl.canSchedule(pub({ notify_status: 'sent', notify_resends: 0 }), NOW, { resend: true }).ok, 'renvoi autorisé une fois');
ok(!nl.canSchedule(pub({ notify_status: 'sent', notify_resends: 1 }), NOW, { resend: true }).ok, 'deuxième renvoi refusé');
ok(!nl.canSchedule(pub({ notify_status: 'none' }), NOW, { resend: true }).ok, 'renvoi sans envoi initial → refus');
ok(!nl.canSchedule(pub({ ends_at: '2026-10-11T09:00:00Z' }), NOW).ok, 'programmation d\'un événement terminé → refus');
ok(!nl.canSchedule(pub({ kind: 'info' }), NOW).ok, 'événement « info » → notification refusée');
ok(nl.canSchedule(pub({ kind: 'alerte' }), NOW).ok, 'événement « alerte » → notification autorisée');

// 4) Fenêtre d'annulation / échéance
const sched = nl.scheduledAtFrom(NOW);
ok(sched.getTime() === NOW + nl.SEND_DELAY_MS && nl.SEND_DELAY_MIN >= 0, 'échéance = maintenant + délai');
ok(nl.isWithinCancelWindow(sched, NOW), 'avant échéance → annulable');
ok(!nl.isWithinCancelWindow(sched, NOW + nl.SEND_DELAY_MS + 1), 'après échéance → non annulable');
ok(nl.isDue({ notify_status: 'scheduled', notify_scheduled_at: new Date(NOW - 1000) }, NOW), 'échéance passée → dû');
ok(!nl.isDue({ notify_status: 'scheduled', notify_scheduled_at: new Date(NOW + 60000) }, NOW), 'échéance future → pas dû');
ok(!nl.isDue({ notify_status: 'sent', notify_scheduled_at: new Date(NOW - 1000) }, NOW), 'déjà envoyé → pas dû');

// 5) Plafonds
ok(nl.orgDailyCapOk(0) && !nl.orgDailyCapOk(nl.MAX_PER_ORG_DAY), 'plafond quotidien par organisation');
ok(!nl.needsManualValidation(nl.MAX_RECIPIENTS_AUTO) && nl.needsManualValidation(nl.MAX_RECIPIENTS_AUTO + 1), 'validation manuelle au-delà du plafond destinataires');

// 6) Destinataires STRICTEMENT en zone (par INSEE résolu)
const subs = [
  { id: 1, insee: '05061' }, { id: 2, insee: '05061' },
  { id: 3, insee: '05063' }, { id: 4, insee: null },
];
const inZone = nl.filterRecipients(subs, pub({ commune_insee: '05061' }), { inseeOf: (s) => s.insee });
ok(inZone.length === 2 && inZone.every((s) => s.insee === '05061'), 'ne garde que les abonnés de la commune');
ok(nl.filterRecipients(subs, pub({ commune_insee: '99999' }), { inseeOf: (s) => s.insee }).length === 0, 'aucun abonné hors zone');
ok(nl.filterRecipients(subs, pub({ commune_insee: '05061' }), { inseeOf: (s) => s.insee, matchesCategory: (s) => s.id === 1 }).length === 1, 'hook préférence catégorie respecté');

// 7) Séquence réelle : programmer → (fenêtre) annuler → reprogrammer → échéance → envoyé → renvoi
let e = pub();
ok(nl.canSchedule(e, NOW).ok, 'séquence : programmation'); e.notify_status = 'scheduled'; e.notify_scheduled_at = nl.scheduledAtFrom(NOW);
ok(nl.isWithinCancelWindow(e.notify_scheduled_at, NOW), 'séquence : annulable dans la fenêtre'); e.notify_status = 'none'; e.notify_scheduled_at = null;
ok(nl.canSchedule(e, NOW).ok, 'séquence : reprogrammation après annulation'); e.notify_status = 'scheduled';
ok(nl.isDue({ notify_status: 'scheduled', notify_scheduled_at: new Date(NOW) }, NOW), 'séquence : dû à l\'échéance'); e.notify_status = 'sent'; e.notify_resends = 0;
ok(nl.canSchedule(e, NOW, { resend: true }).ok, 'séquence : renvoi unique'); e.notify_resends = 1;
ok(!nl.canSchedule(e, NOW, { resend: true }).ok, 'séquence : plus de renvoi');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
