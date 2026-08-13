const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { sendConfirmation } = require('../mailer');
const { validateParams } = require('../params');
const { trackDomain } = require('../doomname');
const { award } = require('../points');
const { addFavorite } = require('./collections'); // même helper « abonnement = favori » (best-effort)

// apiRouter : endpoints JSON destinés aux machines (monté sous /api).
// pagesRouter : pages HTML destinées aux humains, liens cliqués depuis un email
// (monté à la racine, sans préfixe /api).
const apiRouter = express.Router();
const pagesRouter = express.Router();

// Limiteur strict sur l'inscription (déclenche des envois d'emails) : 8/min/IP.
const subscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
});

const DEFAULT_SOURCE = 'leboncoin-livraison';

// Petite page HTML autonome, même charte que le site, pour les liens
// cliqués depuis un email (confirmation / désinscription). Exportée : réutilisée
// telle quelle par la confirmation de tâche à échéance (routes/user-tasks.js).
// ATTENTION : n'échappe pas ses interpolations — n'y passer que du texte de
// confiance, ou l'échapper en amont (cf. escapeHtml dans routes/user-tasks.js).
// `headExtra` : balises injectées dans le <head> (ex. un <script src> externe).
// La CSP du site interdit les scripts inline ('script-src': 'self', cf. index.js) —
// tout script passé ici DOIT être un fichier servi depuis /js/.
// Palette alignée sur tokens.css (violet --amber #a567e3) : elle était restée sur
// l'ancienne identité ambre, ce qui sortait de la charte les TROIS pages issues de
// cette fonction (confirmation d'inscription, désabonnement, confirmation de tâche).
// NB : thème via prefers-color-scheme — une page autonome ne peut pas lire le choix
// html[data-theme] du site (localStorage) sans script.
function htmlPage({ title, heading, message, tone = 'ok', headExtra = '' }) {
  const accent = tone === 'err' ? '#dc2626' : '#16a34a';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — LaBonneAlerte</title>
${headExtra}
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    background: #fdfaff; color: #0f1419;
  }
  .card {
    max-width: 420px; margin: 24px; padding: 36px 32px; text-align: center;
    background: #fff; border: 1px solid #eaddf8; border-radius: 14px;
    box-shadow: 0 6px 20px rgba(28,33,40,0.06);
  }
  .mark { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 18px;
    background: ${accent}; opacity: 0.12; }
  h1 { font-size: 1.25rem; margin: 0 0 10px; }
  p { color: #6b6459; margin: 0 0 22px; line-height: 1.6; }
  a.home { display: inline-block; text-decoration: none; font-weight: 500;
    color: #fff; background: #a567e3; padding: 10px 20px; border-radius: 9px; }
  @media (prefers-color-scheme: dark) {
    body { background: #141218; color: #f2efe9; }
    .card { background: #2e3440; border-color: #3a4150; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    p { color: #9aa3ad; }
    a.home { background: #bd8ef0; color: #141218; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="mark"></div>
    <h1>${heading}</h1>
    <p>${message}</p>
    <a class="home" href="/">Retour à l'accueil</a>
  </div>
</body>
</html>`;
}

// POST /subscribe — inscrit une adresse à une source et envoie le mail de confirmation.
// Corps : { email, source_id? } (source_id par défaut : 'leboncoin-livraison').
apiRouter.post('/subscribe', subscribeLimiter, async (req, res) => {
  const { email, source_id, params } = req.body || {};
  const sourceId = source_id || DEFAULT_SOURCE;

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const normalized = email.toLowerCase();

  try {
    // La source doit exister (sinon la FK échouerait). On récupère aussi son schéma.
    const src = await pool.query('SELECT params_schema FROM sources WHERE id = $1', [sourceId]);
    if (src.rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }

    // Source paramétrée (v2) : params requis et validés contre le schéma. Source
    // broadcast : params ignoré (chemin v1 inchangé, abonnement à params NULL).
    const schema = src.rows[0].params_schema || null;
    let canonicalParams = null;
    if (schema) {
      const check = validateParams(schema, params);
      if (!check.ok) return res.status(400).json({ error: check.error });
      canonicalParams = check.params;
    }

    // Trouve ou crée le subscriber (unique par email).
    const token = crypto.randomBytes(32).toString('hex'); // 64 caractères hex
    const inserted = await pool.query(
      `INSERT INTO subscribers (email, confirmed, token)
       VALUES ($1, false, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, token, confirmed`,
      [normalized, token]
    );

    let subscriber;
    if (inserted.rows.length > 0) {
      subscriber = inserted.rows[0];
    } else {
      const existing = await pool.query(
        'SELECT id, token, confirmed FROM subscribers WHERE email = $1',
        [normalized]
      );
      subscriber = existing.rows[0];
    }

    // Lie le subscriber à la source ; rows vide si l'abonnement existe déjà.
    // params NULL = broadcast (v1) ; JSONB = instance paramétrée (v2). ON CONFLICT
    // cible l'index unique d'expression (subscriber_id, source_id, COALESCE(params,'{}')).
    const link = await pool.query(
      `INSERT INTO subscriptions (subscriber_id, source_id, params)
       VALUES ($1, $2, $3)
       ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING
       RETURNING subscriber_id`,
      [subscriber.id, sourceId, canonicalParams ? JSON.stringify(canonicalParams) : null]
    );

    if (link.rows.length === 0) {
      return res.status(409).json({ error: 'Déjà inscrit à cette source' });
    }

    // Abonnement neuf : points a l'abonne (une fois par source a vie). Credite meme
    // un compte non confirme/sans session : inoffensif, le solde l'attend a la 1re
    // connexion. Effet secondaire non bloquant.
    await award(subscriber.id, 'ALERT_SUBSCRIBED', sourceId);

    // Ajoute la source à « Ma collection » (favoris) — même règle que partout : tout
    // abonnement pose le favori. Rattaché au subscriber_id (indépendant de la confirmation :
    // si le compte se confirme, il retrouve sa collection ; sinon, ça ne coûte rien). Idempotent.
    await addFavorite(subscriber.id, sourceId);

    // DoomName : enregistre le domaine pour surveillance (best-effort, non bloquant).
    if (sourceId === 'doomname' && canonicalParams && canonicalParams.domaine) {
      trackDomain(canonicalParams.domaine);
    }

    // Mail de confirmation seulement si l'adresse n'est pas encore confirmée.
    if (!subscriber.confirmed) {
      await sendConfirmation(email, subscriber.token);
    }

    return res.status(200).json({ message: 'Inscription enregistrée, vérifie tes emails' });
  } catch (err) {
    console.error('[subscribe] Erreur POST /subscribe :', err.message);
    return res.status(503).json({ error: 'DB unavailable' });
  }
});


// GET /confirm/:token — valide l'inscription.
pagesRouter.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE subscribers SET confirmed = true WHERE token = $1 RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).type('html').send(
        htmlPage({
          title: 'Lien invalide',
          heading: 'Lien invalide ou expiré',
          message: "Ce lien de confirmation n'est plus valable. Tu peux te réinscrire depuis l'accueil.",
          tone: 'err',
        })
      );
    }

    return res.status(200).type('html').send(
      htmlPage({
        title: 'Inscription confirmée',
        heading: 'Inscription confirmée ✅',
        message: 'Ton adresse est validée. Tu recevras un email dès que tes alertes deviennent actives.',
      })
    );
  } catch (err) {
    console.error('[subscribe] Erreur GET /confirm :', err.message);
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

// POST /unsubscribe/:token — désinscription « One-Click » (bouton natif Gmail via
// l'en-tête List-Unsubscribe-Post). Répond 200 sans page HTML.
pagesRouter.post('/unsubscribe/:token', async (req, res) => {
  try {
    await pool.query('DELETE FROM subscribers WHERE token = $1', [req.params.token]);
    return res.sendStatus(200);
  } catch (err) {
    console.error('[subscribe] Erreur POST /unsubscribe :', err.message);
    return res.sendStatus(503);
  }
});

// GET /unsubscribe/:token — supprime l'abonné.
pagesRouter.get('/unsubscribe/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `DELETE FROM subscribers WHERE token = $1 RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).type('html').send(
        htmlPage({
          title: 'Lien invalide',
          heading: 'Lien invalide ou déjà utilisé',
          message: "Ce lien de désinscription n'est plus valable. Tu es peut-être déjà désinscrit.",
          tone: 'err',
        })
      );
    }

    return res.status(200).type('html').send(
      htmlPage({
        title: 'Désinscription',
        heading: 'Désinscription effectuée',
        message: "Tu ne recevras plus d'alertes. Tu peux revenir t'inscrire quand tu veux.",
      })
    );
  } catch (err) {
    console.error('[subscribe] Erreur GET /unsubscribe :', err.message);
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

module.exports = { apiRouter, pagesRouter, htmlPage };
