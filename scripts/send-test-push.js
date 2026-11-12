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
// Deux transports (colonne kind) : 'web' (Web Push VAPID) et 'expo' (app iOS). L'envoi passe par
// la fonction factorisée de server/webpush.js (sendOne), la même que le poller.
// Le .env est chargé comme server/db/migrate.js (dotenv, depuis le dossier courant).
//
// Usage (DATABASE_URL nécessaire ; VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY pour kind='web' seulement) :
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr               (liste MES appareils, check)
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr --id=42       (check : montre l'envoi prévu)
//   railway run node scripts/send-test-push.js --email=moi@exemple.fr --id=42 --send
//
// Le message est neutre (« Test de La Bonne Alerte ») et pointe vers la page d'accueil.
// Aucune écriture en base : un abonnement mort (404/410, DeviceNotRegistered) est signalé, mais l'abonnement
// n'est PAS supprimé ici (le poller s'en charge à son prochain envoi).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const SEND = args.send === true;
const MODE = SEND ? 'ENVOI REEL (--send)' : 'SIMULATION (--check, rien n\'est envoye)';

/** Transport et adresse masquée : jamais le jeton ni l'endpoint en entier. */
function maskEndpoint(url, kind = 'web') {
  if (kind === 'expo') {
    const t = String(url || '');
    return `[expo] ${t.slice(0, Math.min(22, Math.floor(t.length / 2)))}…`;
  }
  try {
    const u = new URL(url);
    return `[web] ${u.protocol}//${u.host}/…${url.slice(-6)}`;
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
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.kind, ps.created_at
         FROM push_subscriptions ps JOIN subscribers s ON s.id = ps.subscriber_id
        WHERE s.email = $1 ORDER BY ps.id`,
      [email]
    );
    if (!rows.length) {
      console.log('Aucun appareil enregistré pour ce compte.');
      return;
    }
    console.log(`Appareils du compte (${rows.length}) :`);
    rows.forEach((r) => console.log(`  #${r.id}  ${maskEndpoint(r.endpoint, r.kind)}  (depuis ${r.created_at.toISOString().slice(0, 10)})`));

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
    console.log(`\nCible : #${target.id} ${maskEndpoint(target.endpoint, target.kind)}`);
    console.log(`Charge utile (${Buffer.byteLength(payload)} octets) : ${payload}`);

    if (!SEND) {
      console.log('\nSIMULATION : aucune notification envoyée. Ajoutez --send pour envoyer.');
      return;
    }
    const kind = target.kind || 'web';
    if (kind !== 'expo' && (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)) {
      console.error('Clés VAPID absentes de l\'environnement : envoi web impossible.');
      process.exit(2);
    }
    // Envoi ciblé sur CETTE ligne seulement, par la fonction factorisée (aucune purge ici).
    const { _sendOne: sendOne } = require('../server/webpush');
    const outcome = await sendOne(target, JSON.parse(payload));
    if (outcome === 'sent') {
      console.log(`\nVérification : envoi accepté par le service ${kind === 'expo' ? 'Expo' : 'Web Push'}.`);
    } else if (outcome === 'dead') {
      console.error('\nÉchec : cet abonnement est mort (le poller le supprimera).');
      process.exitCode = 1;
    } else {
      console.error(`\nÉchec : envoi ${outcome === 'skipped' ? 'ignoré (VAPID absent)' : 'refusé ou injoignable'} (détail ci-dessus).`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
})();
