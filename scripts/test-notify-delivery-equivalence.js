// scripts/test-notify-delivery-equivalence.js — LOT C (complément) : NON-RÉGRESSION.
// Rejoue la VRAIE fonction extraite server/notify-delivery.deliverToSubscribers contre une
// COPIE VERBATIM de l'ancienne boucle de poller.dispatchAlert, sur des fixtures, et prouve
// l'équivalence des effets observables (email groupé, push par appareil, file de veille).
// Dépendances injectées (espions) : AUCUN envoi réel, aucun réseau, aucune base.
// Lancer : node scripts/test-notify-delivery-equivalence.js
'use strict';
const assert = require('assert');
const { deliverToSubscribers } = require('../server/notify-delivery.js');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

// ── Espions partagés (réinitialisables) ────────────────────────────────────────
function makeSpies() {
  const calls = { emails: [], push: [], deferred: [] };
  return {
    calls,
    deps: {
      // isQuietNow déterministe : piloté par la fixture (s.__quiet), jamais l'horloge réelle.
      isQuietNow: (s) => !!s.__quiet,
      sendPromoAlert: async (recipients /* , info */) => { calls.emails.push(recipients.map((r) => ({ email: r.email, token: r.token }))); return { sent: recipients.length, failed: 0 }; },
      sendToSubscriber: async (id /* , info */) => { calls.push.push(id); return { sent: 1 }; },
      pool: { query: async (sql, params) => { calls.deferred.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return { rows: [] }; } },
    },
  };
}

// ── Copie VERBATIM de l'ancienne boucle dispatchAlert (avant extraction) ────────
// (mêmes règles, mêmes espions injectés) — sert de référence de non-régression.
async function OLD_dispatch(subs, info, ref, deps) {
  const { sendPromoAlert, sendToSubscriber, isQuietNow, pool } = deps;
  const sourceId = ref.sourceId != null ? ref.sourceId : null;
  const params = ref.params != null ? ref.params : null;
  const payload = { name: info.name, message: info.message, url: info.url, statusUrl: info.statusUrl };
  const paramsJson = params ? JSON.stringify(params) : null;
  const immediateEmails = [], immediatePush = [], toDefer = [];
  for (const s of subs) {
    const wantsEmail = s.email_enabled !== false;
    const wantsPush = (s.push_count || 0) > 0;
    if (!wantsEmail && !wantsPush) continue;
    if (isQuietNow(s)) {
      if (wantsEmail) toDefer.push([s.id, sourceId, paramsJson, 'email', JSON.stringify(payload)]);
      if (wantsPush) toDefer.push([s.id, sourceId, paramsJson, 'push', JSON.stringify(payload)]);
    } else {
      if (wantsEmail) immediateEmails.push({ email: s.email, token: s.token });
      if (wantsPush) immediatePush.push(s.id);
    }
  }
  let email = { sent: 0, failed: 0 };
  if (immediateEmails.length) { try { email = await sendPromoAlert(immediateEmails, info); } catch (e) {} }
  let pushSent = 0;
  for (const id of immediatePush) { try { const r = await sendToSubscriber(id, info); pushSent += r.sent; } catch (e) {} }
  let deferred = 0;
  for (const v of toDefer) { try { await pool.query('INSERT INTO deferred_notifications (subscriber_id, source_id, params, kind, payload) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)', v); deferred += 1; } catch (e) {} }
  return { email, pushSent, deferred };
}

// ── Fixtures : tous les cas de figure ──────────────────────────────────────────
const SUBS = [
  { id: 1, email: 'a@x.fr', token: 't1', email_enabled: true, push_count: 2, __quiet: false }, // email + push immédiats
  { id: 2, email: 'b@x.fr', token: 't2', email_enabled: true, push_count: 0, __quiet: false }, // email seul
  { id: 3, email: 'c@x.fr', token: 't3', email_enabled: false, push_count: 1, __quiet: false }, // push seul
  { id: 4, email: 'd@x.fr', token: 't4', email_enabled: false, push_count: 0, __quiet: false }, // ni l'un ni l'autre → ignoré
  { id: 5, email: 'e@x.fr', token: 't5', email_enabled: true, push_count: 3, __quiet: true },  // heures calmes → différés email+push
  { id: 6, email: 'f@x.fr', token: null, email_enabled: true, push_count: 0, __quiet: false }, // email sans token
  { id: 1, email: 'a@x.fr', token: 't1', email_enabled: true, push_count: 2, __quiet: false }, // DOUBLON de s1 (aucune dédup attendue)
];
const INFO = { name: 'Travaux', message: 'Rue fermée', url: null, statusUrl: 'https://labonnealerte.fr/commune/05061' };
const REF = { sourceId: null, params: null };

(async () => {
  console.log('TEST non-régression : notify-delivery ≡ ancien dispatchAlert');

  const A = makeSpies(); const retNew = await deliverToSubscribers(SUBS, INFO, REF, A.deps);
  const B = makeSpies(); const retOld = await OLD_dispatch(SUBS, INFO, REF, B.deps);

  // Équivalence stricte des effets observables.
  try { assert.deepStrictEqual(A.calls.emails, B.calls.emails); ok(true, 'email : mêmes lots de destinataires (groupés)'); }
  catch (e) { ok(false, 'email : DIFFÉRENCE → ' + e.message); }
  try { assert.deepStrictEqual(A.calls.push, B.calls.push); ok(true, 'push : mêmes identifiants d’appareils, même ordre'); }
  catch (e) { ok(false, 'push : DIFFÉRENCE → ' + e.message); }
  try { assert.deepStrictEqual(A.calls.deferred, B.calls.deferred); ok(true, 'file de veille : mêmes INSERT (params identiques)'); }
  catch (e) { ok(false, 'différés : DIFFÉRENCE → ' + e.message); }
  try { assert.deepStrictEqual(retNew, retOld); ok(true, 'valeur de retour identique {email,pushSent,deferred}'); }
  catch (e) { ok(false, 'retour : DIFFÉRENCE → ' + e.message); }

  // Contrôles explicites des cas couverts (sur la sortie du nouveau code).
  ok(A.calls.emails.length === 1 && A.calls.emails[0].length === 4, 'email groupé : 4 destinataires immédiats (s1,s2,s6,doublon s1)');
  ok(JSON.stringify(A.calls.push) === '[1,3,1]', 'push : s1, s3, et doublon s1 (aucune dédup) dans l’ordre');
  ok(A.calls.deferred.length === 2 && A.calls.deferred.every((d) => d.params[0] === 5), 'heures calmes : 2 différés pour s5 (email+push)');
  ok(A.calls.deferred.some((d) => d.params[3] === 'email') && A.calls.deferred.some((d) => d.params[3] === 'push'), 'différés : un email ET un push');
  ok(A.calls.emails[0].some((r) => r.token === null), 'email sans token transmis tel quel (désinscription gérée en aval)');
  ok(retNew.email.sent === 4 && retNew.pushSent === 3 && retNew.deferred === 2, 'compteurs : 4 emails, 3 push (doublon s1 compté), 2 différés');

  // Cas réseau : sendPromoAlert qui jette ne doit pas interrompre (comportement conservé).
  const C = makeSpies(); C.deps.sendPromoAlert = async () => { throw new Error('SMTP down'); };
  const r = await deliverToSubscribers([SUBS[0]], INFO, REF, C.deps);
  ok(r.email.sent === 0 && r.pushSent === 1, 'échec email avalé, push poursuivi (inchangé)');

  // ── LOT D : préférence de canal (notify_channel) ───────────────────────────────
  // both/null = comportement historique (email + push) ; email = email seul ; push = push seul.
  const D = makeSpies();
  const CH = [
    { id: 10, email: 'ch-both@x.fr',  token: 'tb', email_enabled: true, push_count: 1, notify_channel: 'both',  __quiet: false },
    { id: 11, email: 'ch-null@x.fr',  token: 'tn', email_enabled: true, push_count: 1, notify_channel: null,    __quiet: false },
    { id: 12, email: 'ch-email@x.fr', token: 'te', email_enabled: true, push_count: 1, notify_channel: 'email', __quiet: false },
    { id: 13, email: 'ch-push@x.fr',  token: 'tp', email_enabled: true, push_count: 1, notify_channel: 'push',  __quiet: false },
  ];
  await deliverToSubscribers(CH, INFO, REF, D.deps);
  const emailedTokens = D.calls.emails.length ? D.calls.emails[0].map((r) => r.token) : [];
  ok(emailedTokens.indexOf('tb') !== -1 && emailedTokens.indexOf('tn') !== -1, 'canal both/null : email envoyé (défaut historique)');
  ok(emailedTokens.indexOf('te') !== -1, 'canal email : email envoyé');
  ok(emailedTokens.indexOf('tp') === -1, 'canal push : PAS d’email');
  ok(D.calls.push.indexOf(10) !== -1 && D.calls.push.indexOf(11) !== -1 && D.calls.push.indexOf(13) !== -1, 'canal both/null/push : push envoyé');
  ok(D.calls.push.indexOf(12) === -1, 'canal email : PAS de push');

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
