// Boutique de skins cosmetiques (phase 3, SQUELETTE). Achats en POINTS uniquement
// (jamais d'argent reel). Trois endpoints :
//   GET  /api/skins        -> catalogue actif + possedes + solde + equipes
//   POST /api/skins/buy    -> achat atomique (transaction : solde suffisant, pas de
//                             double-achat, jamais de solde negatif)
//   POST /api/skins/equip  -> equipe/desequipe un skin possede (dashboard ou par deck)
// Le rendu (classe CSS asset_ref) est branche cote client ; ici, pur mecanisme.

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');

const router = express.Router();

// GET /api/skins — catalogue des skins actifs, marques possedes/equipes pour l'appelant.
// Auth requise (fonctionnalite de compte : on renvoie le solde et la possession).
router.get('/skins', async (req, res) => {
  const token = req.query.token;
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const me = await pool.query(
      'SELECT points_balance, equipped_dashboard_skin_id FROM subscribers WHERE id = $1',
      [auth.id]
    );
    const balance = (me.rows[0] && me.rows[0].points_balance) || 0;
    const equippedDashboard = (me.rows[0] && me.rows[0].equipped_dashboard_skin_id) || null;

    // Catalogue actif + flag owned (LEFT JOIN sur la possession de l'appelant).
    // cost = 0 => possede d'office : c'est le skin de base, acquis par tout le monde
    // sans achat ni ligne user_skins (donc rien a backfiller pour les comptes existants).
    const { rows } = await pool.query(
      `SELECT s.id, s.type, s.name, s.cost, s.asset_ref,
              (us.subscriber_id IS NOT NULL OR s.cost = 0) AS owned
         FROM skins s
         LEFT JOIN user_skins us ON us.skin_id = s.id AND us.subscriber_id = $1
        WHERE s.active = true
        ORDER BY s.type ASC, s.cost ASC, s.name ASC`,
      [auth.id]
    );

    return res.status(200).json({
      balance,
      equipped_dashboard_skin_id: equippedDashboard,
      skins: rows,
    });
  } catch (err) {
    console.error('[skins] Erreur GET /skins :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/skins/buy — { token, skin_id }. Achat atomique dans une transaction :
// verrouille le skin actif, decremente le solde SEULEMENT s'il suffit (garde
// points_balance >= cost), refuse le double-achat. Tout echec -> ROLLBACK, l'action
// est sans effet (jamais de solde negatif, jamais de demi-achat).
router.post('/skins/buy', async (req, res) => {
  const body = req.body || {};
  const { token } = body;
  const skinId = body.skin_id;
  if (!skinId || typeof skinId !== 'string') {
    return res.status(400).json({ error: 'skin_id manquant' });
  }
  let auth;
  try {
    auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  } catch (err) {
    console.error('[skins] Erreur auth POST /buy :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Skin achetable ?
    const sk = await client.query(
      'SELECT cost FROM skins WHERE id = $1 AND active = true',
      [skinId]
    );
    if (sk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Skin inconnu ou indisponible' });
    }
    const cost = sk.rows[0].cost;

    // Deja possede ? (garde explicite avant tout mouvement de solde)
    const owned = await client.query(
      'SELECT 1 FROM user_skins WHERE subscriber_id = $1 AND skin_id = $2',
      [auth.id, skinId]
    );
    if (owned.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Skin déjà possédé' });
    }

    // Decrement conditionnel : n'affecte la ligne QUE si le solde suffit.
    const dec = await client.query(
      `UPDATE subscribers SET points_balance = points_balance - $1
        WHERE id = $2 AND points_balance >= $1
        RETURNING points_balance`,
      [cost, auth.id]
    );
    if (dec.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Solde insuffisant' });
    }

    // Enregistre la possession (ON CONFLICT = garde-fou anti-course concurrente).
    const ins = await client.query(
      `INSERT INTO user_skins (subscriber_id, skin_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING skin_id`,
      [auth.id, skinId]
    );
    if (ins.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Skin déjà possédé' });
    }

    await client.query('COMMIT');
    return res.status(200).json({ skin_id: skinId, balance: dec.rows[0].points_balance });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* deja rollback/deconnecte */ }
    console.error('[skins] Erreur POST /buy :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  } finally {
    client.release();
  }
});

// POST /api/skins/equip — { token, skin_id (nullable), collection_id? }.
// skin_id null = desequipe (retour au defaut / heritage). Avec collection_id : override
// du deck (type 'deck', deck possede par l'appelant). Sans : skin dashboard (type
// 'dashboard'). Un skin non null doit etre POSSEDE et du bon type.
router.post('/skins/equip', async (req, res) => {
  const body = req.body || {};
  const { token } = body;
  const skinId = body.skin_id == null ? null : body.skin_id;
  const collectionId = body.collection_id == null ? null : body.collection_id;
  const wantsDeck = collectionId !== null;
  const expectedType = wantsDeck ? 'deck' : 'dashboard';

  if (skinId !== null && typeof skinId !== 'string') {
    return res.status(400).json({ error: 'skin_id invalide' });
  }
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    // Skin non null : doit etre possede ET du bon type pour la cible.
    if (skinId !== null) {
      const chk = await pool.query(
        `SELECT 1 FROM user_skins us
           JOIN skins s ON s.id = us.skin_id
          WHERE us.subscriber_id = $1 AND us.skin_id = $2 AND s.type = $3`,
        [auth.id, skinId, expectedType]
      );
      if (chk.rows.length === 0) {
        return res.status(409).json({ error: 'Skin non possédé ou incompatible' });
      }
    }

    if (wantsDeck) {
      // Deck de l'appelant uniquement (owner_subscriber_id = auth.id).
      const upd = await pool.query(
        `UPDATE collections SET equipped_skin_id = $1
          WHERE id = $2 AND owner_subscriber_id = $3
          RETURNING id`,
        [skinId, collectionId, auth.id]
      );
      if (upd.rows.length === 0) return res.status(404).json({ error: 'Deck inconnu' });
      return res.status(200).json({ collection_id: collectionId, equipped_skin_id: skinId });
    }

    await pool.query(
      'UPDATE subscribers SET equipped_dashboard_skin_id = $1 WHERE id = $2',
      [skinId, auth.id]
    );
    return res.status(200).json({ equipped_dashboard_skin_id: skinId });
  } catch (err) {
    console.error('[skins] Erreur POST /equip :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
