// Livraison PARTAGÉE d'une notification à une liste d'abonnés DÉJÀ RÉSOLUE.
// Extrait de poller.dispatchAlert (comportement IDENTIQUE) pour être réutilisé par la
// diffusion des événements municipaux ET testable en isolation. Un SEUL système d'envoi.
//
// Règles (inchangées) : opt-in email (email_enabled !== false) et push (push_count > 0) ;
// en heures de veille (isQuietNow), email et push sont MIS EN FILE (deferred_notifications),
// sinon envoyés immédiatement (sendPromoAlert groupé pour l'email, sendToSubscriber par push).
//
// Dépendances résolues PARESSEUSEMENT (require à l'appel) : requérir ce module ne démarre
// donc ni le mailer ni web-push. Les tests injectent `deps` pour éviter tout envoi réel.
'use strict';

async function deliverToSubscribers(subs, info, ref = {}, deps = {}) {
  const sendPromoAlert = deps.sendPromoAlert || require('./mailer').sendPromoAlert;
  const sendToSubscriber = deps.sendToSubscriber || require('./webpush').sendToSubscriber;
  const isQuietNow = deps.isQuietNow || require('./quiet-hours').isQuietNow;
  const pool = deps.pool || require('./db').pool;

  const sourceId = ref.sourceId != null ? ref.sourceId : null;
  const params = ref.params != null ? ref.params : null;
  const payload = { name: info.name, message: info.message, url: info.url, statusUrl: info.statusUrl };
  const paramsJson = params ? JSON.stringify(params) : null;
  const immediateEmails = [];
  const immediatePush = [];
  const toDefer = [];

  for (const s of subs) {
    // Préférence de canal (LOT D) : 'both' (défaut = comportement historique), 'email' ou
    // 'push'. null/absent ⇒ 'both' ⇒ exactement l'ancien comportement (opt-in email + push).
    const channel = s.notify_channel || 'both';
    const wantsEmail = channel !== 'push' && s.email_enabled !== false;
    const wantsPush = channel !== 'email' && (s.push_count || 0) > 0;
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
  if (immediateEmails.length) {
    try { email = await sendPromoAlert(immediateEmails, info); }
    catch (err) { console.error('[notify] envoi email :', err.message); }
  }
  let pushSent = 0;
  for (const id of immediatePush) {
    try { const r = await sendToSubscriber(id, info); pushSent += r.sent; }
    catch (err) { console.error(`[notify] push #${id} :`, err.message); }
  }
  let deferred = 0;
  for (const v of toDefer) {
    try {
      await pool.query(
        'INSERT INTO deferred_notifications (subscriber_id, source_id, params, kind, payload) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)',
        v
      );
      deferred += 1;
    } catch (err) { console.error('[notify] insert différé :', err.message); }
  }
  return { email, pushSent, deferred };
}

module.exports = { deliverToSubscribers };
