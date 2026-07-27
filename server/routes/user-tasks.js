// V3 · TÂCHE À ÉCHÉANCE GLISSANTE — confirmation par lien email (étape 3/3).
//
// Périmètre volontairement minimal : UNE route, celle que l'utilisateur clique
// dans son email de relance (« c'est fait »). Pas de création, pas de liste,
// pas de POST API — le bouton in-app du verso-instance viendra à l'étape UI.
//
// GET (et non POST) : aucun client mail n'envoie de POST au clic. Même pattern
// que GET /confirm/:token et GET /unsubscribe/:token (routes/subscribe.js),
// monté sur pagesRouter à la racine, réponse HTML autonome via htmlPage().
//
// Sécurité : le token EST l'authentification (lien secret, comme le lien
// magique). Il est à usage unique de fait — régénéré à chaque confirmation,
// ce qui invalide l'ancien lien et rend une relance rejouée sans effet.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { htmlPage } = require('./subscribe');

const pagesRouter = express.Router();

// Unités autorisées → arguments de make_interval(). Liste fermée : le nom de
// l'unité ne transite JAMAIS en concaténation SQL, on ne passe que des entiers.
const UNIT_TO_INTERVAL = {
  day:   (v) => ({ days: v,     months: 0, years: 0 }),
  week:  (v) => ({ days: v * 7, months: 0, years: 0 }),
  month: (v) => ({ days: 0,     months: v, years: 0 }),
  year:  (v) => ({ days: 0,     months: 0, years: v }),
};

// htmlPage() interpole sans échapper : le libellé est du texte UTILISATEUR,
// il doit être neutralisé avant d'entrer dans le gabarit.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function errPage(res, status, heading, message) {
  return res.status(status).type('html').send(
    htmlPage({ title: 'Lien invalide', heading, message, tone: 'err' })
  );
}

// GET /tache/:id/confirmer/:token — « c'est fait » : décale l'échéance.
pagesRouter.get('/tache/:id/confirmer/:token', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const token = String(req.params.token || '');

  // Garde-fous de forme avant toute requête (token = hex 64, id = entier).
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[0-9a-f]{64}$/.test(token)) {
    return errPage(res, 404, 'Lien invalide',
      "Ce lien de confirmation n'est pas valable.");
  }

  try {
    // Le token seul identifierait la ligne (index unique), mais on exige aussi
    // l'id : un lien tronqué ou recomposé ne doit pas tomber sur une autre tâche.
    const { rows } = await pool.query(
      `SELECT id, label, tracking_mode, periodicity_value, periodicity_unit, active
         FROM user_tasks WHERE id = $1 AND confirm_token = $2`,
      [id, token]
    );

    if (rows.length === 0) {
      // Message identique à celui d'un token périmé : on ne révèle pas si la
      // tâche existe. Cas courant et légitime : lien déjà utilisé.
      return errPage(res, 404, 'Lien invalide ou déjà utilisé',
        "Ce lien n'est plus valable. Il a probablement déjà servi : chaque confirmation en génère un nouveau.");
    }

    const task = rows[0];

    if (!task.active) {
      return errPage(res, 410, 'Tâche archivée',
        "Cette tâche n'est plus suivie. Tu peux la réactiver depuis ton compte.");
    }

    // Mode 'counter' : pas de notification proactive au MVP, donc aucun lien de
    // ce type n'est censé exister. Erreur explicite plutôt que recalcul silencieux.
    if (task.tracking_mode !== 'time') {
      return errPage(res, 409, 'Confirmation impossible',
        'Cette tâche se suit au compteur : elle se met à jour par un relevé, pas par une confirmation de date.');
    }

    const shift = UNIT_TO_INTERVAL[task.periodicity_unit];
    if (!shift || !(task.periodicity_value > 0)) {
      // Ne devrait pas arriver (CHECK user_tasks_time_fields_chk + _unit_chk) :
      // filet pour une ligne écrite hors application.
      console.error(`[user-tasks] tâche #${task.id} : périodicité illisible ` +
        `(${task.periodicity_value} ${task.periodicity_unit})`);
      return errPage(res, 500, 'Configuration incomplète',
        'La périodicité de cette tâche est incomplète. Complète-la depuis ton compte.');
    }
    const iv = shift(task.periodicity_value);

    // Nouveau token : invalide le lien qui vient d'être cliqué (usage unique).
    const nextToken = crypto.randomBytes(32).toString('hex');

    // L'échéance repart d'AUJOURD'HUI, pas de l'ancien next_due : c'est tout le
    // sens de « glissante » (une vidange faite avec 3 semaines de retard décale
    // la suivante d'autant). Le décalage calendaire est confié à make_interval
    // (PG natif) : il gère 31 → 30 et les années bissextiles sans code maison.
    // next_due calculé en UTC serveur — décalage négligeable à cette granularité.
    const upd = await pool.query(
      `UPDATE user_tasks
          SET anchor_date = CURRENT_DATE,
              next_due = (CURRENT_DATE + make_interval(days => $2, months => $3, years => $4))::date,
              last_confirmed_at = NOW(),
              confirm_token = $5
        WHERE id = $1 AND active = true
        RETURNING next_due`,
      [task.id, iv.days, iv.months, iv.years, nextToken]
    );

    if (upd.rows.length === 0) {
      // Course : la tâche a été archivée entre le SELECT et l'UPDATE.
      return errPage(res, 410, 'Tâche archivée',
        "Cette tâche n'est plus suivie.");
    }

    const due = upd.rows[0].next_due;
    const dueFr = due
      ? new Date(due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return res.status(200).type('html').send(
      htmlPage({
        title: 'Échéance confirmée',
        heading: 'C’est noté ✅',
        message: `« ${escapeHtml(task.label)} » est marquée comme faite.` +
          (dueFr ? ` Prochaine échéance : le ${dueFr}.` : ''),
      })
    );
  } catch (err) {
    console.error('[user-tasks] Erreur GET /tache/:id/confirmer :', err.message);
    return res.status(503).type('html').send(
      htmlPage({
        title: 'Erreur',
        heading: 'Service momentanément indisponible',
        message: 'Impossible de traiter ta demande pour le moment. Merci de réessayer dans quelques minutes.',
        tone: 'err',
      })
    );
  }
});

module.exports = { pagesRouter };
