// scripts/send-test-push.js
// ─────────────────────────────────────────────────────────────────────────────
// ENVOI D'UNE NOTIFICATION DE TEST À UN SEUL APPAREIL (fil APP-01).
//
// MODE PAR DÉFAUT : --check (simulation). Le script lit l'abonnement push désigné
// (SELECT uniquement), affiche ce qu'il enverrait, et N'ENVOIE RIEN.
// Il faut --send pour envoyer réellement, et toujours UN SEUL appareil :
// l'abonnement est désigné par son id (table push_subscriptions) ET l'email du compte,
// qui doivent correspondre. Aucune boucle sur plusieurs appareils n'existe dans ce script.
//
// Usage (variables de la prod nécessaires : DATABASE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) :
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr               (liste MES appareils, check)
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr --id=42       (check : montre l'envoi prévu)
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr --id=42 --send
//
// Le message est neutre (« Test de La Bonne Alerte ») et pointe vers la page d'accueil.
// Aucune écriture en base : un 404/410 du service push est signalé, mais l'abonnement
// n'est PAS supprimé ici (le poller s'en charge à son prochain envoi).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const SEND = args.send === true;
const MODE = SEND ? 'ENVOI REEL (--send)' : 'SIMULATION (--check, rien n\'est envoye)';

function maskEndpoint(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…${url.slice(-6)}`;
  } catch (e) {
    return '(adresse illisible)';
  }
}

(async () => {
  console.log('════════════════════════════════════════════');
  console.log(`  send-test-push — MODE : ${MODE}`);
  console.log('════════════════════════════════════════════');

  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  if (!email) {
    console.error('Paramètre --email=<adresse du compte> obligatoire.');
    process.exit(2);
  }
  const { pool } = require('../server/db');
  try {
    const { rows } = await pool.query(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.created_at
         FROM push_subscriptions ps JOIN subscribers s ON s.id = ps.subscriber_id
        WHERE s.email = $1 ORDER BY ps.id`,
      [email]
    );
    if (!rows.length) {
      console.log('Aucun appareil enregistré pour ce compte.');
      return;
    }
    console.log(`Appareils du compte (${rows.length}) :`);
    rows.forEach((r) => console.log(`  #${r.id}  ${maskEndpoint(r.endpoint)}  (depuis ${r.created_at.toISOString().slice(0, 10)})`));

    if (!args.id) {
      console.log('\nIndiquez --id=<n> pour cibler UN appareil.');
      return;
    }
    const target = rows.find((r) => String(r.id) === String(args.id));
    if (!target) {
      console.error(`\nL'appareil #${args.id} n'appartient pas à ce compte : rien n'est fait.`);
      process.exit(2);
    }
    const payload = JSON.stringify({
      title: 'Test de La Bonne Alerte',
      body: 'Si vous lisez ceci, les notifications arrivent sur cet appareil.',
      url: 'https://labonnealerte.fr',
    });
    console.log(`\nCible : #${target.id} ${maskEndpoint(target.endpoint)}`);
    console.log(`Charge utile (${Buffer.byteLength(payload)} octets) : ${payload}`);

    if (!SEND) {
      console.log('\nSIMULATION : aucune notification envoyée. Ajoutez --send pour envoyer.');
      return;
    }
    const webpush = require('web-push');
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.error('Clés VAPID absentes de l\'environnement : envoi impossible.');
      process.exit(2);
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:contact@labonnealerte.fr',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    try {
      const r = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { TTL: 300, urgency: 'normal' }
      );
      console.log(`\nVérification : le service push a répondu HTTP ${r.statusCode} (201 attendu).`);
    } catch (err) {
      console.error(`\nÉchec : HTTP ${err.statusCode || '?'} ${err.body || err.message}`);
      if (err.statusCode === 404 || err.statusCode === 410) console.error('Cet abonnement est mort (le poller le supprimera).');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
})();
