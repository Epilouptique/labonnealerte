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
const { authenticate } = require('../sessions');
const ugc = require('../ugc');

const pagesRouter = express.Router();
// apiRouter : confirmation IN-APP (fetch depuis le kiosque, session en corps JSON).
// Le lien email garde sa propre route sur pagesRouter — deux portes d'entrée, une
// seule logique de décalage (applyTimeConfirmation ci-dessous).
const apiRouter = express.Router();

// Unités autorisées → arguments de make_interval(). Liste fermée : le nom de
// l'unité ne transite JAMAIS en concaténation SQL, on ne passe que des entiers.
// Partagée par la CRÉATION (ancrage = anchor_date saisi) et la CONFIRMATION
// (ancrage = aujourd'hui) : une seule table de correspondance pour les deux.
const UNITS = {
  day:   (v) => ({ days: v,     months: 0, years: 0 }),
  week:  (v) => ({ days: v * 7, months: 0, years: 0 }),
  month: (v) => ({ days: 0,     months: v, years: 0 }),
  year:  (v) => ({ days: 0,     months: 0, years: v }),
};
// null si l'unité est inconnue ou la valeur non strictement positive.
function intervalFor(value, unit) {
  const f = UNITS[unit];
  if (!f || !(value > 0)) return null;
  return f(value);
}

/* ---------------- Anti-abus : création de tâches ----------------
   20 créations/heure/compte, en mémoire, même esprit que decks.js (rateOk). */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES = 20;
const createHits = new Map();
function rateOk(id) {
  const now = Date.now();
  const recent = (createHits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CREATES) { createHits.set(id, recent); return false; }
  recent.push(now); createHits.set(id, recent); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of createHits) {
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length) createHits.set(id, recent); else createHits.delete(id);
  }
}, WINDOW_MS).unref();

// Préavis maximal cohérent : jamais plus long que la période elle-même
// (« prévenez-moi 2 ans avant une tâche mensuelle » ouvrirait la fenêtre en
// permanence et la relance partirait aussitôt, à chaque échéance).
// Approximations 30 j/mois et 365 j/an : il s'agit de BORNER UNE SAISIE, pas de
// calculer une échéance — ce calcul-là reste exact, confié à make_interval.
function maxAnnounceDays(value, unit) {
  const perDay = { day: 1, week: 7, month: 30, year: 365 }[unit] || 1;
  return Math.max(1, Math.min(365, value * perDay));
}

// Décale l'échéance d'une tâche 'time' déjà validée par l'appelant : anchor = today,
// next_due recalculé, horodatage, et NOUVEAU token (invalide un lien email en attente).
// Partagé par les deux portes d'entrée (lien email et bouton in-app) : une seule
// définition de « ce que veut dire confirmer ».
// Retours : la nouvelle next_due ; null si la tâche a été archivée entre-temps
// (course entre le SELECT et l'UPDATE) ; undefined si la périodicité est illisible.
//
// L'échéance repart d'AUJOURD'HUI, pas de l'ancien next_due : c'est tout le sens de
// « glissante » (une vidange faite avec 3 semaines de retard décale la suivante
// d'autant). Le décalage calendaire est confié à make_interval (PG natif) : il gère
// 31 → 30 et les années bissextiles sans code maison. next_due calculé en UTC serveur
// — décalage négligeable à cette granularité.
async function applyTimeConfirmation(task) {
  const iv = intervalFor(task.periodicity_value, task.periodicity_unit);
  if (!iv) return undefined;
  const { rows } = await pool.query(
    `UPDATE user_tasks
        SET anchor_date = CURRENT_DATE,
            next_due = (CURRENT_DATE + make_interval(days => $2, months => $3, years => $4))::date,
            last_confirmed_at = NOW(),
            confirm_token = $5
      WHERE id = $1 AND active = true
      RETURNING next_due`,
    [task.id, iv.days, iv.months, iv.years, crypto.randomBytes(32).toString('hex')]
  );
  return rows.length ? rows[0].next_due : null;
}

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

    // Décalage : logique partagée avec la confirmation in-app (apiRouter).
    // Le nouveau token invalide le lien qui vient d'être cliqué (usage unique).
    const due = await applyTimeConfirmation(task);

    if (due === undefined) {
      // Ne devrait pas arriver (CHECK user_tasks_time_fields_chk + _unit_chk) :
      // filet pour une ligne écrite hors application.
      console.error(`[user-tasks] tâche #${task.id} : périodicité illisible ` +
        `(${task.periodicity_value} ${task.periodicity_unit})`);
      return errPage(res, 500, 'Configuration incomplète',
        'La périodicité de cette tâche est incomplète. Complète-la depuis ton compte.');
    }
    if (due === null) {
      // Course : la tâche a été archivée entre le SELECT et l'UPDATE.
      return errPage(res, 410, 'Tâche archivée',
        "Cette tâche n'est plus suivie.");
    }

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

// POST /api/user-tasks/:id/confirm — « c'est fait » depuis le kiosque.
// Corps : { token }. Le projet n'a pas de middleware d'auth : chaque route appelle
// authenticate() à la main, avec le token en corps JSON (cf. myalerts.js). La
// propriété est vérifiée dans le WHERE — une tâche d'un autre abonné répond 404,
// jamais 403 (pas d'énumération des tâches d'autrui).
apiRouter.post('/user-tasks/:id/confirm', async (req, res) => {
  const auth = await authenticate((req.body || {}).token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, label, tracking_mode, periodicity_value, periodicity_unit, active
         FROM user_tasks WHERE id = $1 AND subscriber_id = $2`,
      [id, auth.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tâche inconnue' });

    const task = rows[0];
    if (!task.active) return res.status(410).json({ error: "Cette tâche n'est plus suivie" });
    // Mode 'counter' : pas de confirmation par date (le relevé vient de l'utilisateur).
    if (task.tracking_mode !== 'time') {
      return res.status(409).json({ error: 'Cette tâche se suit au compteur, pas par confirmation de date' });
    }

    const nextDue = await applyTimeConfirmation(task);
    if (nextDue === undefined) {
      console.error(`[user-tasks] tâche #${task.id} : périodicité illisible ` +
        `(${task.periodicity_value} ${task.periodicity_unit})`);
      return res.status(500).json({ error: 'Périodicité de la tâche incomplète' });
    }
    if (nextDue === null) return res.status(410).json({ error: "Cette tâche n'est plus suivie" });

    return res.json({ id: task.id, next_due: nextDue, message: 'Échéance décalée' });
  } catch (err) {
    console.error('[user-tasks] Erreur POST /user-tasks/:id/confirm :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/user-tasks — crée une tâche à échéance glissante.
// Corps : { token, label, anchor_date, periodicity_value, periodicity_unit, announce_days? }.
// tracking_mode est FIXÉ à 'time' côté serveur et n'est JAMAIS lu du client : tant que
// le mode 'counter' n'a pas son UI de relevé, cette route ne peut pas en créer une.
// ANTI-HALLUCINATION : aucune périodicité par défaut, aucun preset réglementaire. Tous
// les champs de durée sont obligatoires et proviennent de la saisie utilisateur.
apiRouter.post('/user-tasks', async (req, res) => {
  const body = req.body || {};
  const auth = await authenticate(body.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  if (!rateOk(auth.id)) return res.status(429).json({ error: 'Trop de créations, réessayez plus tard.' });

  const label = ugc.validateTaskLabel(body.label);
  if (!label.ok) return res.status(400).json({ error: 'Libellé : ' + label.error });

  // Dernière réalisation : format ISO strict, date réellement existante, jamais future.
  const rawDate = String(body.anchor_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return res.status(400).json({ error: 'Date de dernière réalisation invalide' });
  }
  const d = new Date(rawDate + 'T00:00:00Z');
  // Le second test rejette les dates inexistantes (31/02 → 03/03 après normalisation).
  if (isNaN(d.getTime()) || rawDate !== d.toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Date de dernière réalisation invalide' });
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  if (rawDate > todayIso) {
    return res.status(400).json({ error: 'La dernière réalisation ne peut pas être dans le futur' });
  }

  const value = Number(body.periodicity_value);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    return res.status(400).json({ error: 'Périodicité : indiquez un nombre entier positif' });
  }
  const unit = String(body.periodicity_unit || '');
  const iv = intervalFor(value, unit);
  if (!iv) return res.status(400).json({ error: 'Périodicité : unité inconnue' });

  // Préavis : défaut 7 (choix produit), borné par la période elle-même.
  const announce = (body.announce_days == null || body.announce_days === '') ? 7 : Number(body.announce_days);
  if (!Number.isInteger(announce) || announce < 0) {
    return res.status(400).json({ error: 'Préavis : indiquez un nombre de jours entier' });
  }
  const maxAnnounce = maxAnnounceDays(value, unit);
  if (announce > maxAnnounce) {
    return res.status(400).json({
      error: `Préavis trop long : ${maxAnnounce} jours au maximum pour cette périodicité`,
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_tasks
         (subscriber_id, label, tracking_mode, anchor_date, periodicity_value, periodicity_unit,
          next_due, announce_days, confirm_token)
       VALUES ($1, $2, 'time', $3::date, $4, $5,
          ($3::date + make_interval(days => $6, months => $7, years => $8))::date, $9, $10)
       RETURNING id, label, tracking_mode, next_due`,
      [auth.id, label.value, rawDate, value, unit, iv.days, iv.months, iv.years, announce,
       crypto.randomBytes(32).toString('hex')]
    );
    return res.status(201).json({ task: rows[0] });
  } catch (err) {
    // 23505 = violation d'unicité → idx_user_tasks_unique_label (subscriber_id, label)
    // WHERE active = true. Message clair plutôt que l'erreur PG brute.
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Vous suivez déjà une tâche portant ce nom' });
    }
    console.error('[user-tasks] Erreur POST /user-tasks :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = { pagesRouter, apiRouter };
