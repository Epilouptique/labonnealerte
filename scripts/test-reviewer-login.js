// scripts/test-reviewer-login.js — compte relecteur Google Play (code fixe, aucun e-mail).
// Hors ligne : aucune base, aucun réseau, aucun envoi réel. Pilote les variables
// d'environnement et vérifie le verdict de connexion + l'absence totale de notification.
// Lancer : node scripts/test-reviewer-login.js
'use strict';
const assert = require('assert');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

const REVIEWER = 'play-review@example.com';
const CODE = '246813';

function setEnv(email, code) {
  if (email === null) delete process.env.REVIEWER_EMAIL; else process.env.REVIEWER_EMAIL = email;
  if (code === null) delete process.env.REVIEWER_CODE; else process.env.REVIEWER_CODE = code;
}

const reviewer = require('../server/reviewer');
const { deliverToSubscribers } = require('../server/notify-delivery');

(async () => {
  console.log('TEST compte relecteur (code fixe, zéro notification)');

  // 1) Variables absentes → fonction INACTIVE (aucun comportement spécial).
  setEnv(null, null);
  ok(reviewer.isEnabled() === false, 'sans variables : désactivé');
  ok(reviewer.classifyReviewerLogin(REVIEWER, CODE) === 'disabled', 'sans variables : login relecteur inactif (disabled)');
  ok(reviewer.isReviewerEmail(REVIEWER) === false, 'sans variables : adresse non traitée comme relecteur');

  // 2) Une seule variable → toujours inactif.
  setEnv(REVIEWER, null);
  ok(reviewer.isEnabled() === false, 'REVIEWER_CODE manquant : désactivé');
  setEnv(null, CODE);
  ok(reviewer.isEnabled() === false, 'REVIEWER_EMAIL manquant : désactivé');

  // 3) Code mal formé (pas 6 chiffres) → désactivé.
  setEnv(REVIEWER, '12345');
  ok(reviewer.isEnabled() === false, 'code à 5 chiffres : désactivé');
  setEnv(REVIEWER, '12ab56');
  ok(reviewer.isEnabled() === false, 'code non numérique : désactivé');

  // 4) Configuration valide : login OK, mauvais code refusé, autre adresse intacte.
  setEnv(REVIEWER, CODE);
  ok(reviewer.isEnabled() === true, 'variables valides : activé');
  ok(reviewer.classifyReviewerLogin(REVIEWER, CODE) === 'match', 'bon code → match (session ouverte)');
  ok(reviewer.classifyReviewerLogin('PLAY-Review@Example.COM', CODE) === 'match', 'adresse insensible à la casse → match');
  ok(reviewer.classifyReviewerLogin(REVIEWER, '000000') === 'mismatch', 'mauvais code → mismatch (refusé)');
  ok(reviewer.classifyReviewerLogin('autre@example.com', CODE) === 'not-reviewer', 'autre adresse → flux normal (not-reviewer)');
  ok(reviewer.classifyReviewerLogin('autre@example.com', '000000') === 'not-reviewer', 'autre adresse + mauvais code → flux normal');

  // 5) Aucune notification réelle (mail/push/différé) vers l'adresse relecteur.
  {
    const calls = { emails: [], push: [], deferred: [] };
    const deps = {
      isQuietNow: () => false,
      sendPromoAlert: async (r) => { calls.emails.push(r.map((x) => x.email)); return { sent: r.length, failed: 0 }; },
      sendToSubscriber: async (id) => { calls.push.push(id); return { sent: 1 }; },
      pool: { query: async (sql, p) => { calls.deferred.push(p[0]); return { rows: [] }; } },
      // isReviewerEmail NON injecté : on utilise la vraie implémentation (pilotée par l'env).
    };
    const subs = [
      { id: 1, email: REVIEWER, token: 'tr', email_enabled: true, push_count: 2 }, // relecteur → ignoré
      { id: 2, email: 'vrai@abonne.fr', token: 't2', email_enabled: true, push_count: 1 }, // normal
    ];
    const info = { name: 'Alerte', message: 'test', url: null, statusUrl: 'https://x' };
    const ret = await deliverToSubscribers(subs, info, {}, deps);
    ok(calls.emails.length === 1 && calls.emails[0].length === 1 && calls.emails[0][0] === 'vrai@abonne.fr',
      'email : seul l’abonné normal destinataire, relecteur exclu');
    ok(calls.push.length === 1 && calls.push[0] === 2, 'push : seul l’abonné normal, relecteur exclu');
    ok(!calls.emails.some((lot) => lot.includes(REVIEWER)), 'aucun e-mail vers l’adresse relecteur');
    ok(ret.email.sent === 1 && ret.pushSent === 1, 'compteurs : 1 email, 1 push (relecteur non compté)');

    // Même en heures calmes, le relecteur n'est jamais mis en file.
    const calls2 = { deferred: [] };
    const deps2 = { ...deps, isQuietNow: () => true,
      pool: { query: async (sql, p) => { calls2.deferred.push(p[0]); return { rows: [] }; } } };
    await deliverToSubscribers([subs[0]], info, {}, deps2);
    ok(calls2.deferred.length === 0, 'heures calmes : relecteur jamais mis en file (deferred_notifications)');
  }

  // 6) Désactivé → l'adresse « relecteur » redevient un abonné normal (preuve d'isolement).
  setEnv(null, null);
  {
    const calls = { push: [] };
    const deps = {
      isQuietNow: () => false,
      sendPromoAlert: async (r) => ({ sent: r.length, failed: 0 }),
      sendToSubscriber: async (id) => { calls.push.push(id); return { sent: 1 }; },
      pool: { query: async () => ({ rows: [] }) },
    };
    await deliverToSubscribers([{ id: 9, email: REVIEWER, token: 't', email_enabled: true, push_count: 1 }], { name: 'a', message: 'b' }, {}, deps);
    ok(calls.push.length === 1, 'sans variables : cette adresse reçoit normalement (aucun traitement spécial résiduel)');
  }

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
