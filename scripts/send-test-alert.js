// scripts/send-test-alert.js
// ─────────────────────────────────────────────────────────────────────────────
// TEST CIBLÉ D'UNE ALERTE RÉELLE, POUR UN SEUL COMPTE, SANS IMPACTER LES AUTRES.
//
// POURQUOI UN PUSH CIBLÉ (et pas un événement en base) :
//   Le chemin réel de l'app a DEUX canaux pour une alerte :
//     1. PUSH (UnifiedPush = Web Push) : le poller appelle sendToSubscriber(abonné, info)
//        → notification sur les appareils de CET abonné uniquement. Payload = {title, body, url}.
//     2. LISTE IN-APP / vérification périodique : GET /api/app/events lit la table
//        `source_events`, qui est **par SOURCE** (colonnes id, source_id, event, message,
//        created_at — AUCUNE colonne d'abonné). Un événement y est donc visible par TOUS les
//        abonnés de la source via la jointure EXISTS(subscriptions). Idem /api/my-alerts/history.
//   => Insérer un événement de test rendrait l'alerte visible à TOUS les abonnés de la source
//      (ici « tarif streaming netflix »), ce qui est exclu. Et le rendre visible au seul compte
//      exigerait de MODIFIER puis DÉPLOYER la requête /api/app/events — exclu aussi.
//   DONC : ce script reproduit l'expérience RÉELLE par le canal PUSH, byte-identique à une vraie
//   alerte (même code de prod `sendToSubscriber`, même payload {title=nom source, body=message,
//   url}), vers les SEULS appareils du compte visé. La liste in-app n'affichera rien (aucun
//   événement écrit) — c'est le prix de l'isolation totale. Voir le rapport associé.
//
// GARANTIES :
//   - Aucun autre abonné : on n'envoie qu'aux push_subscriptions du subscriber_id résolu par --email.
//   - Aucun e-mail : le mailer n'est jamais appelé.
//   - Aucune écriture sur l'état de la source (source_states), les compteurs (counters), ni
//     source_events / historique public : ce script n'écrit RIEN de tout cela. Rien à nettoyer
//     en base, rien n'« expire » — l'alerte de test n'existe que comme notification transitoire
//     sur le téléphone. (--cleanup le confirme et ne fait rien d'autre.)
//   - Seule écriture possible, héritée du code de prod sendToSubscriber : la purge d'un endpoint
//     push MORT (404/410) APPARTENANT À CE COMPTE — jamais un état partagé, jamais un compteur.
//
// MODES :
//   (défaut) --check : simulation. Montre le payload exact + les appareils cibles (masqués). N'ENVOIE RIEN.
//   --send           : envoi réel du push aux appareils du compte.
//   --cleanup        : ne fait rien en base (rien n'est persisté) ; confirme l'absence de résidu.
//
// Usage (env de prod requis : DATABASE_URL + VAPID_* pour --send) :
//   node scripts/send-test-alert.js --email=hugo@... --source=hausse-tarif-streaming --service=netflix
//   node scripts/send-test-alert.js --email=hugo@... --source=hausse-tarif-streaming --service=netflix --send
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config();

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const SEND = args.send === true;
const CLEANUP = args.cleanup === true;
const MODE = CLEANUP ? 'CLEANUP (aucune écriture en base, rien à nettoyer)'
  : SEND ? 'ENVOI RÉEL (--send)' : 'SIMULATION (--check, rien n\'est envoyé)';

const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
const sourceId = typeof args.source === 'string' ? args.source.trim() : '';
const service = typeof args.service === 'string' ? args.service.trim() : '';
const labelTest = args['label-test'] === true; // préfixe « [Test] » optionnel (sinon rendu identique)

function maskEndpoint(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}/…${String(url).slice(-6)}`; }
  catch (e) { return '(adresse illisible)'; }
}

(async () => {
  console.log('════════════════════════════════════════════');
  console.log(`  send-test-alert — MODE : ${MODE}`);
  console.log('════════════════════════════════════════════');

  if (!email || !sourceId) {
    console.error('Paramètres requis : --email=<compte> --source=<id de source> [--service=<combo>] [--message="…"] [--url=…]');
    process.exit(2);
  }

  const { pool } = require('../server/db');
  try {
    // 1) Compte (abonné) visé.
    const sub = await pool.query('SELECT id, email FROM subscribers WHERE email = $1', [email]);
    if (!sub.rows.length) { console.error(`Compte introuvable : ${email}`); process.exit(2); }
    const subscriberId = sub.rows[0].id;

    // 2) Source existante (nom réel = titre du push, identique à une vraie alerte).
    const src = await pool.query('SELECT id, name, enabled FROM sources WHERE id = $1', [sourceId]);
    if (!src.rows.length) { console.error(`Source introuvable : ${sourceId}`); process.exit(2); }
    const source = src.rows[0];

    // 3) Abonnement de ce compte à cette source (réalisme ; on avertit si absent).
    const paramsObj = service ? { service } : null;
    const subCheck = paramsObj
      ? await pool.query("SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND source_id=$2 AND params=$3::jsonb", [subscriberId, sourceId, JSON.stringify(paramsObj)])
      : await pool.query("SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND source_id=$2 AND params IS NULL", [subscriberId, sourceId]);
    if (!subCheck.rows.length) {
      console.warn(`⚠️  Ce compte n'est pas (ou pas avec ces params) abonné à ${sourceId}${service ? ' {service:' + service + '}' : ''} — le push partira quand même vers ses appareils.`);
    }

    // 4) Message/URL : par défaut, le libellé EXACT d'une vraie alerte de cette source.
    const defaults = {
      'hausse-tarif-streaming': {
        netflix: { message: '💶 Changement détecté sur la page des tarifs Netflix. Vérifiez si une évolution de prix vous concerne.', url: 'https://help.netflix.com/fr/node/24926' },
      },
    };
    const d = (defaults[sourceId] && defaults[sourceId][service]) || {};
    let message = typeof args.message === 'string' ? args.message : (d.message || 'Une alerte que vous suivez vient de se déclencher.');
    if (labelTest) message = '[Test] ' + message;
    const statusUrl = `https://labonnealerte.fr/source/${encodeURIComponent(sourceId)}/statut`;
    const url = typeof args.url === 'string' ? args.url : (d.url || statusUrl);

    // info : EXACTEMENT ce que le poller passe à sendToSubscriber pour une vraie alerte.
    const info = { id: sourceId, name: source.name, message, url, statusUrl };
    // Payload tel que webpush.js le construit (pour l'afficher en simulation, à l'identique).
    const payload = { title: info.name || 'La Bonne Alerte', body: info.message, url: info.url || info.statusUrl };

    // 5) Appareils cibles (du SEUL compte visé).
    const devices = await pool.query('SELECT id, endpoint, created_at FROM push_subscriptions WHERE subscriber_id = $1 ORDER BY id', [subscriberId]);
    console.log(`Compte : ${email} (#${subscriberId}) — source : ${source.name} [${sourceId}]${service ? ' {service:' + service + '}' : ''}`);
    console.log(`Appareils push de CE compte (${devices.rows.length}) — seuls destinataires possibles :`);
    devices.rows.forEach((r) => console.log(`  #${r.id}  ${maskEndpoint(r.endpoint)}  (depuis ${r.created_at.toISOString().slice(0, 10)})`));
    console.log('Payload push (identique à une vraie alerte) :');
    console.log('  ' + JSON.stringify(payload));

    if (CLEANUP) {
      console.log('\n--cleanup : ce mécanisme n\'écrit RIEN en base (ni source_events, ni source_states, ni counters). Rien à nettoyer.');
      return;
    }
    if (!SEND) {
      console.log('\nSIMULATION : aucun push envoyé, aucune écriture. Ajoutez --send pour envoyer réellement à ce seul compte.');
      return;
    }
    if (!devices.rows.length) { console.log('\nAucun appareil push pour ce compte : rien à envoyer.'); return; }

    // 6) Envoi RÉEL via le code de PRODUCTION (payload et chemin identiques à une vraie alerte).
    const { isEnabled, sendToSubscriber } = require('../server/webpush');
    if (!isEnabled()) { console.error('\nVAPID absent de l\'environnement : envoi push impossible.'); process.exit(2); }
    const r = await sendToSubscriber(subscriberId, info);
    console.log(`\nEnvoi terminé : ${r.sent} appareil(s) notifié(s), ${r.failed} échec(s), ${r.removed} endpoint(s) mort(s) purgé(s) (de ce compte).`);
  } catch (e) {
    console.error('Erreur :', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
