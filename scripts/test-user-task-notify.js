// scripts/test-user-task-notify.js — DÉCLENCHEUR MANUEL (test de bout en bout V3).
// Lance le job de relance des « tâches à échéance glissante » sans attendre le cron
// quotidien de 9h (Europe/Paris, cf. startPoller dans server/poller.js).
//
// C'est EXACTEMENT le même code que le cron : runUserTaskNotify(pool), rien de plus.
// Aucune donnée en dur, aucun contournement, aucune variante de comportement — ce
// script ne fait que remplacer le déclencheur horaire par un appel direct.
//
// ⚠️ ENVOIE DE VRAIS EMAILS et écrit last_notified_at sur les tâches traitées.
// Toute tâche dont la fenêtre d'annonce est ouverte sera relancée, y compris celles
// d'autres comptes si la base est partagée. À lancer en connaissance de cause.
// La garde anti-spam fait qu'un SECOND lancement ne renverra rien : pour rejouer la
// même relance, il faut remettre last_notified_at à NULL sur la tâche visée.
//
//   node scripts/test-user-task-notify.js

require('dotenv').config();
const { pool } = require('../server/db');
const { runUserTaskNotify } = require('../server/user-tasks-notify');

async function main() {
  try {
    const res = await runUserTaskNotify(pool);
    // runUserTaskNotify journalise déjà le détail ligne à ligne ; on résume.
    console.log('Résultat : ' + JSON.stringify(res));
    console.log(`  envoyées  : ${res.sent}`);
    console.log(`  échecs    : ${res.failed}`);
    console.log(`  différées : ${res.skipped}  (abonné en heures de veille)`);
    if (res.failed > 0) process.exitCode = 1;
  } catch (e) {
    // runUserTaskNotify capture déjà ses propres erreurs (DB, envoi) et ne rejette
    // pas en principe : ce catch est un filet, pas un chemin nominal.
    console.error('ECHEC :', e.message);
    process.exitCode = 1;
  } finally {
    // Indispensable en shell : sans pool.end(), la socket reste ouverte et le
    // process ne rend jamais la main (cf. purge-veille-artiste-spotify.js).
    await pool.end();
  }
}

if (require.main === module) main();
module.exports = { main };
