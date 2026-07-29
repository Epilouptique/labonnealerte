// V3 · TÂCHE À ÉCHÉANCE GLISSANTE — job de relance (étape 2/3).
//
// Balaye une fois par jour les tâches en mode 'time' dont la fenêtre d'annonce
// est ouverte, et envoie UNE relance par échéance. Hors du cycle du poller :
// aucune source n'est interrogée, aucun état de veille n'est calculé.
//
// Le mode 'counter' est HORS PÉRIMÈTRE (aucune notification proactive au MVP :
// le relevé vient de l'utilisateur, le serveur ne peut pas le deviner).
//
// Une tâche notifiée puis jamais confirmée reste silencieuse, même longtemps
// après l'échéance : « une seule relance par échéance » est un choix produit
// assumé au MVP, pas un oubli. Une relance de retard (ex. J+30) serait une
// condition supplémentaire à écrire explicitement.

const { sendTaskDueReminder } = require('./mailer');
const { isQuietNow } = require('./quiet-hours');

// Candidats à la relance.
//   1. fenêtre ouverte : next_due - announce_days <= aujourd'hui
//      (next_due est DATE et announce_days INTEGER → soustraction de jours
//       native, qui reste une DATE. Pas de make_interval nécessaire ici,
//       contrairement au décalage d'échéance qui, lui, a une unité variable.)
//   2. garde anti-spam : jamais notifiée, OU notifiée AVANT l'ouverture de la
//      fenêtre courante. Une confirmation qui repousse next_due décale la
//      fenêtre → le droit à une relance se rouvre pour la nouvelle échéance.
//   3. destinataire joignable : mêmes filtres que partout ailleurs dans le
//      projet (confirmed + email_enabled), cf. poller.js.
// Comparaison timestamptz/date évaluée dans le fuseau de session (UTC sur
// Railway) — décalage négligeable à une granularité journalière.
const SELECT_DUE = `
  SELECT ut.id, ut.label, ut.next_due, ut.confirm_token,
         s.id AS subscriber_id, s.email, s.token,
         s.quiet_start, s.quiet_end, s.quiet_disabled
    FROM user_tasks ut
    JOIN subscribers s ON s.id = ut.subscriber_id
    -- Pause globale de la carte pour cet abonné (subscriptions.muted, même drapeau
    -- que toutes les autres cartes). La pause ne touche AUCUNE tâche : user_tasks.active
    -- reste true, next_due continue d'avancer à chaque confirmation, seule la relance
    -- est suspendue. Réversible à tout moment depuis le recto de la carte.
    LEFT JOIN subscriptions sub
           ON sub.subscriber_id = ut.subscriber_id
          AND sub.params IS NULL
          AND sub.source_id IN (SELECT id FROM sources WHERE type = 'user-task')
   WHERE ut.active = true
     AND ut.tracking_mode = 'time'
     AND COALESCE(sub.muted, false) = false
     AND ut.next_due IS NOT NULL
     AND ut.next_due - ut.announce_days <= CURRENT_DATE
     AND (ut.last_notified_at IS NULL
          OR ut.last_notified_at < (ut.next_due - ut.announce_days)::timestamptz)
     AND s.confirmed = true
     AND s.email_enabled = true
   ORDER BY ut.next_due ASC`;

async function runUserTaskNotify(pool) {
  let rows;
  try {
    ({ rows } = await pool.query(SELECT_DUE));
  } catch (err) {
    console.error('[user-tasks] lecture des échéances échouée :', err.message);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (rows.length === 0) {
    console.log('[user-tasks] Aucune échéance à relancer.');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const row of rows) {
    // Heures de veille : on NE DIFFÈRE PAS (pas de passage par
    // deferred_notifications, dont le contrat est lié à une source). On saute :
    // last_notified_at reste NULL, le balayage du lendemain reprendra la tâche.
    // Sans effet avec le défaut 23h-8h (le job tourne à 9h), mais respecte les
    // plages personnalisées.
    if (isQuietNow(row)) {
      skipped += 1;
      continue;
    }

    let res;
    try {
      res = await sendTaskDueReminder(
        { email: row.email, token: row.token },
        { id: row.id, label: row.label, next_due: row.next_due, confirm_token: row.confirm_token }
      );
    } catch (err) {
      // sendTaskDueReminder n'est pas censé throw (try/catch interne) : filet.
      console.error(`[user-tasks] tâche #${row.id} : envoi en erreur :`, err.message);
      failed += 1;
      continue;
    }

    if (!res || res.sent !== 1) {
      // Échec d'envoi : on NE POSE PAS last_notified_at, la tâche sera reprise
      // au prochain passage. Un échec ne bloque pas les suivants.
      failed += 1;
      continue;
    }

    try {
      await pool.query('UPDATE user_tasks SET last_notified_at = NOW() WHERE id = $1', [row.id]);
      sent += 1;
    } catch (err) {
      // Email parti mais horodatage non écrit : la tâche sera relancée demain.
      // Choix assumé — un doublon de relance vaut mieux qu'une échéance muette.
      console.error(`[user-tasks] tâche #${row.id} : email envoyé mais last_notified_at non écrit :`, err.message);
      sent += 1;
    }
  }

  console.log(`[user-tasks] Relances : ${sent} envoyée(s), ${failed} échec(s), ${skipped} différée(s) (heures de veille).`);
  return { sent, failed, skipped };
}

module.exports = { runUserTaskNotify };
