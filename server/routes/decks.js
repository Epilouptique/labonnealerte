// Collections PHASE 2 — decks utilisateurs (UGC), partageables par lien (fork).
// Décisions actées : création réservée aux comptes connectés ; 'private' par défaut,
// 'unlisted' (lien secret) sur action ; AUCUNE galerie publique ; le partage donne
// une COPIE (fork), jamais un suivi vivant. Garde-fous = périmètre (validation UGC
// stricte, tokens non devinables, rate-limit, signalements, cascade RGPD).

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { validateParams } = require('../params');
const { resolveInstances, recomputeDeckCategories } = require('./collections'); // réutilise phase 1
const ugc = require('../ugc');

const router = express.Router();
const MAX_DECKS = 15;
// Teinte dominante 1-11 (défaut 1 = violet). Toute valeur hors plage → 1.
function parseTint(v) { const n = parseInt(v, 10); return (Number.isInteger(n) && n >= 1 && n <= 11) ? n : 1; }

/* ---------------- Rate-limit mémoire : création/édition de deck ---------------- */
// 10 créations+éditions / heure / compte (réutilise l'esprit du likeLimiter).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_OPS = 10;
const opHits = new Map(); // subscriberId -> [timestamps]
function rateOk(id) {
  const now = Date.now();
  const recent = (opHits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_OPS) { opHits.set(id, recent); return false; }
  recent.push(now); opHits.set(id, recent); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of opHits) {
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length) opHits.set(id, recent); else opHits.delete(id);
  }
}, WINDOW_MS).unref();

/* ---------------- Helpers ---------------- */
// Cartes enrichies d'un deck (même forme que /api/sources → rendu client identique).
async function enrichItems(deckId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.subtitle, s.description, s.badge, s.type, s.link_url,
            s.categories, s.submitted_by_github, s.params_schema, s.likes_count, s.created_at,
            CASE WHEN s.type = 'linked' THEN NULL ELSE COALESCE(st.state, 'inactive') END AS state,
            (SELECT COUNT(*) FROM subscriptions sub JOIN subscribers subr ON subr.id = sub.subscriber_id
              WHERE sub.source_id = s.id AND subr.confirmed = true)::int AS subscriber_count,
            (SELECT MAX(created_at) FROM source_events e WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at,
            ci.default_params, ci.position
       FROM collection_items ci
       JOIN sources s ON s.id = ci.source_id AND s.enabled = true
       LEFT JOIN source_states st ON st.source_id = s.id
      WHERE ci.collection_id = $1
      ORDER BY ci.position ASC, s.name ASC`,
    [deckId]
  );
  return rows;
}

// Récupère un deck possédé par l'utilisateur, ou null.
async function ownedDeck(deckId, subscriberId) {
  const { rows } = await pool.query(
    `SELECT id, name, description, emoji, tint, visibility, share_token, forked_from_name, categories
       FROM collections WHERE id = $1 AND owner_subscriber_id = $2`,
    [deckId, subscriberId]
  );
  return rows[0] || null;
}

async function requireAuth(req, res) {
  const token = (req.body && req.body.token) || req.query.token;
  const auth = await authenticate(token);
  if (!auth) { res.status(401).json({ error: 'Session invalide ou expirée' }); return null; }
  return auth;
}

/* ---------------- Pseudo public ---------------- */
// POST /api/my-alerts/display-name — définit/modifie le pseudo (3 changements / 30 j).
router.post('/my-alerts/display-name', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  const v = ugc.validateDisplayName((req.body || {}).display_name);
  if (!v.ok) return res.status(400).json({ error: v.error });
  try {
    const changes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM display_name_changes
        WHERE subscriber_id = $1 AND changed_at > NOW() - INTERVAL '30 days'`,
      [auth.id]
    );
    if (changes.rows[0].n >= 3) {
      return res.status(429).json({ error: 'Trop de changements de nom ce mois-ci (max 3).' });
    }
    // Unicité insensible à la casse (l'index garantit, on capte l'erreur 23505).
    try {
      const upd = await pool.query(
        `UPDATE subscribers SET display_name = $1
          WHERE id = $2 AND (display_name IS DISTINCT FROM $1) RETURNING display_name`,
        [v.value, auth.id]
      );
      if (upd.rows.length === 0) return res.status(200).json({ display_name: v.value }); // inchangé
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ce nom public est déjà pris.' });
      throw e;
    }
    await pool.query('INSERT INTO display_name_changes (subscriber_id) VALUES ($1)', [auth.id]);
    return res.status(200).json({ display_name: v.value });
  } catch (err) {
    console.error('[decks] Erreur POST /display-name :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ---------------- CRUD deck ---------------- */
// GET /api/decks — mes decks (auth).
router.get('/decks', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.emoji, c.tint, c.visibility, c.share_token, c.forked_from_name, c.categories,
              (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id)::int AS card_count,
              -- Apercu du deck (chantier deck-stack) : ID des 3 dernieres cartes (position DESC),
              -- resolus en objets source complets cote client (catalogue /api/sources).
              (SELECT COALESCE(json_agg(p.id), '[]'::json) FROM (
                 SELECT s3.id FROM collection_items ci3
                   JOIN sources s3 ON s3.id = ci3.source_id AND s3.enabled = true
                  WHERE ci3.collection_id = c.id
                  ORDER BY ci3.position DESC LIMIT 3) p) AS preview
         FROM collections c
        WHERE c.owner_subscriber_id = $1
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC`,
      [auth.id]
    );
    const dn = await pool.query('SELECT display_name FROM subscribers WHERE id = $1', [auth.id]);
    return res.status(200).json({
      decks: rows,
      display_name: (dn.rows[0] && dn.rows[0].display_name) || null,
      emojis: ugc.DECK_EMOJIS, // liste fermée pour le sélecteur client (pas de champ libre)
      max_decks: MAX_DECKS,
    });
  } catch (err) {
    console.error('[decks] Erreur GET /decks :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/decks — crée un deck (plafond 10, rate-limit, validation stricte).
router.post('/decks', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  if (!rateOk(auth.id)) return res.status(429).json({ error: 'Trop d\'opérations, réessayez plus tard.' });
  const body = req.body || {};
  const name = ugc.validateDeckName(body.name);
  if (!name.ok) return res.status(400).json({ error: name.error });
  const desc = ugc.validateDeckDescription(body.description);
  if (!desc.ok) return res.status(400).json({ error: desc.error });
  const emoji = body.emoji == null || body.emoji === '' ? '📦' : body.emoji;
  if (!ugc.isValidEmoji(emoji)) return res.status(400).json({ error: 'Émoji non autorisé' });
  try {
    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM collections WHERE owner_subscriber_id = $1', [auth.id]
    );
    if (count.rows[0].n >= MAX_DECKS) {
      return res.status(409).json({ error: `Maximum ${MAX_DECKS} decks.` });
    }
    const id = ugc.genDeckId();
    const tint = parseTint(body.tint);
    // Decks perso PUBLICS par defaut (decouvrables dans le kiosque) ; « Prive » = opt-out.
    // Un token de partage est genere des la creation (page /deck/:token + adoption kiosque).
    const visibility = body.visibility === 'private' ? 'private' : 'public';
    const shareToken = ugc.genShareToken();
    await pool.query(
      `INSERT INTO collections (id, name, description, emoji, tint, owner_subscriber_id, visibility, share_token, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 100)`,
      [id, name.value, desc.value || null, emoji, tint, auth.id, visibility, shareToken]
    );
    return res.status(200).json({ deck: { id, name: name.value, description: desc.value || null, emoji, tint, visibility, share_token: shareToken, card_count: 0 } });
  } catch (err) {
    console.error('[decks] Erreur POST /decks :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// GET /api/decks/:id — détail (owner only) : méta + cartes enrichies.
router.get('/decks/:id', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    const sources = await enrichItems(deck.id);
    return res.status(200).json({ deck, sources });
  } catch (err) {
    console.error('[decks] Erreur GET /decks/:id :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// PATCH /api/decks/:id — édite nom/description/emoji (owner, rate-limit).
router.patch('/decks/:id', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  if (!rateOk(auth.id)) return res.status(429).json({ error: 'Trop d\'opérations, réessayez plus tard.' });
  const body = req.body || {};
  const name = ugc.validateDeckName(body.name);
  if (!name.ok) return res.status(400).json({ error: name.error });
  const desc = ugc.validateDeckDescription(body.description);
  if (!desc.ok) return res.status(400).json({ error: desc.error });
  const emoji = body.emoji == null || body.emoji === '' ? '📦' : body.emoji;
  if (!ugc.isValidEmoji(emoji)) return res.status(400).json({ error: 'Émoji non autorisé' });
  try {
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    const tint = parseTint(body.tint);
    // Bascule Public <-> Prive (opt-in explicite). Public = decouvrable dans le kiosque ;
    // on garantit un token de partage. Prive conserve le token (non resolvable tant que
    // prive) pour retrouver le meme lien si re-publie.
    let visibility = deck.visibility;
    if (body.visibility === 'public' || body.visibility === 'private') visibility = body.visibility;
    let shareToken = deck.share_token;
    if (visibility === 'public' && !shareToken) shareToken = ugc.genShareToken();
    await pool.query(
      `UPDATE collections SET name = $1, description = $2, emoji = $3, tint = $4,
              visibility = $5, share_token = $6, updated_at = NOW()
        WHERE id = $7 AND owner_subscriber_id = $8`,
      [name.value, desc.value || null, emoji, tint, visibility, shareToken, deck.id, auth.id]
    );
    return res.status(200).json({ deck: { id: deck.id, name: name.value, description: desc.value || null, emoji, tint, visibility, share_token: shareToken } });
  } catch (err) {
    console.error('[decks] Erreur PATCH /decks/:id :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// DELETE /api/decks/:id — supprime (owner). Items partent en CASCADE.
router.delete('/decks/:id', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const r = await pool.query(
      'DELETE FROM collections WHERE id = $1 AND owner_subscriber_id = $2 RETURNING id',
      [req.params.id, auth.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Deck inconnu' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[decks] Erreur DELETE /decks/:id :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ---------------- Cartes d'un deck ---------------- */
// POST /api/decks/:id/items — ajoute une carte { source_id, params? }. Une carte
// paramétrée s'ajoute AVEC une instance précise (params validés) stockée en
// default_params. Composer ≠ s'abonner (aucun abonnement créé ici).
router.post('/decks/:id/items', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  const body = req.body || {};
  const sourceId = body.source_id;
  if (!sourceId || typeof sourceId !== 'string') return res.status(400).json({ error: 'source_id requis' });
  try {
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    const src = await pool.query(
      "SELECT params_schema FROM sources WHERE id = $1 AND enabled = true AND type <> 'linked'",
      [sourceId]
    );
    if (src.rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });

    let defaultParams = null;
    const schema = src.rows[0].params_schema;
    if (schema) {
      if (body.params != null) {
        const check = validateParams(schema, body.params);
        if (!check.ok) return res.status(400).json({ error: check.error });
        defaultParams = check.params;
      } // sinon default_params NULL → résolu à l'adoption (profil / à compléter)
    }
    const pos = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM collection_items WHERE collection_id = $1', [deck.id]
    );
    await pool.query(
      `INSERT INTO collection_items (collection_id, source_id, default_params, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params`,
      [deck.id, sourceId, defaultParams ? JSON.stringify(defaultParams) : null, pos.rows[0].p]
    );
    await pool.query('UPDATE collections SET updated_at = NOW() WHERE id = $1', [deck.id]);
    await recomputeDeckCategories(deck.id); // categories auto (top-3) re-derivees
    return res.status(200).json({ ok: true, source_id: sourceId, default_params: defaultParams });
  } catch (err) {
    console.error('[decks] Erreur POST /decks/:id/items :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// DELETE /api/decks/:id/items/:sourceId — retire une carte (owner).
router.delete('/decks/:id/items/:sourceId', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    await pool.query(
      'DELETE FROM collection_items WHERE collection_id = $1 AND source_id = $2',
      [deck.id, req.params.sourceId]
    );
    await pool.query('UPDATE collections SET updated_at = NOW() WHERE id = $1', [deck.id]);
    await recomputeDeckCategories(deck.id); // categories auto (top-3) re-derivees
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[decks] Erreur DELETE /decks/:id/items/:sourceId :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ---------------- Partage (fork par lien non-listé) ---------------- */
// POST /api/decks/:id/share — passe 'unlisted' + génère le token. Requiert un pseudo.
router.post('/decks/:id/share', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const dn = await pool.query('SELECT display_name FROM subscribers WHERE id = $1', [auth.id]);
    if (!dn.rows[0] || !dn.rows[0].display_name) {
      return res.status(409).json({ error: 'display_name_required' });
    }
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    const token = deck.share_token || ugc.genShareToken();
    // Partager = rendre PUBLIC (decouvrable dans le kiosque + lien). Le modele est binaire
    // public/prive depuis le chantier « decks dans la grille » ; 'unlisted' est retire.
    await pool.query(
      `UPDATE collections SET visibility = 'public', share_token = $1, updated_at = NOW()
        WHERE id = $2 AND owner_subscriber_id = $3`,
      [token, deck.id, auth.id]
    );
    return res.status(200).json({ share_token: token, url: '/deck/' + token });
  } catch (err) {
    console.error('[decks] Erreur POST /decks/:id/share :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/decks/:id/unshare — repasse 'private' et INVALIDE le token.
router.post('/decks/:id/unshare', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const r = await pool.query(
      `UPDATE collections SET visibility = 'private', share_token = NULL, updated_at = NOW()
        WHERE id = $1 AND owner_subscriber_id = $2 RETURNING id`,
      [req.params.id, auth.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Deck inconnu' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[decks] Erreur POST /decks/:id/unshare :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ---------------- Vue publique partagée + fork ---------------- */
// GET /api/decks/shared/:token — vue visiteur (auth non requise). Auteur = pseudo
// public uniquement (jamais l'email). Renvoie les cartes enrichies.
router.get('/decks/shared/:token', async (req, res) => {
  try {
    const meta = await pool.query(
      `SELECT c.id, c.name, c.description, c.emoji, c.tint, c.forked_from_name, subr.display_name AS author
         FROM collections c JOIN subscribers subr ON subr.id = c.owner_subscriber_id
        WHERE c.share_token = $1 AND c.visibility IN ('public', 'unlisted')`,
      [req.params.token]
    );
    if (meta.rows.length === 0) return res.status(404).json({ error: 'Deck introuvable ou partage arrêté' });
    const deck = meta.rows[0];
    const sources = await enrichItems(deck.id);
    return res.status(200).json({
      deck: {
        name: deck.name, description: deck.description, emoji: deck.emoji, tint: deck.tint,
        author: deck.author || null, forked_from_name: deck.forked_from_name || null,
      },
      sources,
    });
  } catch (err) {
    console.error('[decks] Erreur GET /decks/shared/:token :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/decks/shared/:token/fork — crée une COPIE privée indépendante chez le
// visiteur connecté. Les évolutions ultérieures de l'original n'affectent pas la copie.
router.post('/decks/shared/:token/fork', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  if (!rateOk(auth.id)) return res.status(429).json({ error: 'Trop d\'opérations, réessayez plus tard.' });
  try {
    const src = await pool.query(
      `SELECT c.id, c.name, c.description, c.emoji, c.tint, subr.display_name AS author
         FROM collections c JOIN subscribers subr ON subr.id = c.owner_subscriber_id
        WHERE c.share_token = $1 AND c.visibility IN ('public', 'unlisted')`,
      [req.params.token]
    );
    if (src.rows.length === 0) return res.status(404).json({ error: 'Deck introuvable ou partage arrêté' });
    const orig = src.rows[0];

    const count = await pool.query('SELECT COUNT(*)::int AS n FROM collections WHERE owner_subscriber_id = $1', [auth.id]);
    if (count.rows[0].n >= MAX_DECKS) return res.status(409).json({ error: `Maximum ${MAX_DECKS} decks.` });

    const newId = ugc.genDeckId();
    await pool.query(
      `INSERT INTO collections (id, name, description, emoji, tint, owner_subscriber_id, visibility, display_order, forked_from_name)
       VALUES ($1, $2, $3, $4, $5, $6, 'private', 100, $7)`,
      [newId, orig.name, orig.description, orig.emoji, orig.tint || 1, auth.id, orig.author || null]
    );
    // Copie indépendante des items (snapshot).
    await pool.query(
      `INSERT INTO collection_items (collection_id, source_id, default_params, position)
       SELECT $1, source_id, default_params, position FROM collection_items WHERE collection_id = $2`,
      [newId, orig.id]
    );
    return res.status(200).json({ deck_id: newId, forked_from_name: orig.author || null });
  } catch (err) {
    console.error('[decks] Erreur POST /fork :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// POST /api/decks/:id/adopt — abonne aux cartes du deck (owner). Idempotent, non
// destructif. Même résolution de params que les collections officielles (phase 1).
router.post('/decks/:id/adopt', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  try {
    const deck = await ownedDeck(req.params.id, auth.id);
    if (!deck) return res.status(404).json({ error: 'Deck inconnu' });
    const prof = await pool.query('SELECT departement FROM subscribers WHERE id = $1', [auth.id]);
    const profileDept = (prof.rows[0] && prof.rows[0].departement) || null;
    const items = await pool.query(
      `SELECT s.id AS source_id, s.name, s.params_schema, ci.default_params
         FROM collection_items ci
         JOIN sources s ON s.id = ci.source_id AND s.enabled = true AND s.type <> 'linked'
        WHERE ci.collection_id = $1 ORDER BY ci.position ASC`,
      [deck.id]
    );
    let added = 0, already = 0; const needsParams = [];
    for (const it of items.rows) {
      const { instances, unresolved } = resolveInstances(it.params_schema, it.default_params, profileDept);
      if (unresolved) { needsParams.push({ source_id: it.source_id, name: it.name }); continue; }
      for (const inst of instances) {
        if (inst === null) {
          const r = await pool.query(
            `INSERT INTO subscriptions (subscriber_id, source_id) VALUES ($1, $2)
             ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING RETURNING subscriber_id`,
            [auth.id, it.source_id]
          );
          if (r.rowCount > 0) added++; else already++;
        } else {
          const check = validateParams(it.params_schema, inst);
          if (!check.ok) { needsParams.push({ source_id: it.source_id, name: it.name }); continue; }
          const r = await pool.query(
            `INSERT INTO subscriptions (subscriber_id, source_id, params) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING RETURNING subscriber_id`,
            [auth.id, it.source_id, JSON.stringify(check.params)]
          );
          if (r.rowCount > 0) added++; else already++;
        }
      }
    }
    return res.status(200).json({ added, already, needs_params: needsParams, total: added + already });
  } catch (err) {
    console.error('[decks] Erreur POST /decks/:id/adopt :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ---------------- Signalement (anonyme autorisé) ---------------- */
// POST /api/decks/shared/:token/report — { target: 'deck' | 'name' }. IP hashée.
// À 3 ip distinctes : le DECK est suspendu ('private', token invalidé) dans tous les cas.
// Le display_name du compte n'est JAMAIS modifié (un pseudo n'est jamais vide). Réponse
// neutre (anti-abus, pas de compteur fuité).
router.post('/decks/shared/:token/report', async (req, res) => {
  const target = ((req.body || {}).target === 'name') ? 'name' : 'deck';
  try {
    const found = await pool.query(
      `SELECT id FROM collections WHERE share_token = $1 AND visibility IN ('public', 'unlisted')`,
      [req.params.token]
    );
    if (found.rows.length === 0) return res.status(200).json({ ok: true }); // neutre
    const deckId = found.rows[0].id;
    const ipHash = ugc.hashIp(req.ip);

    // Idempotent par (deck, target, ip) : un signalant ne compte qu'une fois.
    await pool.query(
      `INSERT INTO deck_reports (deck_id, target, ip_hash) VALUES ($1, $2, $3)`,
      [deckId, target, ipHash]
    );
    const distinct = await pool.query(
      `SELECT COUNT(DISTINCT ip_hash)::int AS n FROM deck_reports WHERE deck_id = $1 AND target = $2`,
      [deckId, target]
    );
    if (distinct.rows[0].n >= 3) {
      // Suspend le deck (repasse 'private', retire du kiosque + coupe le lien) dans tous
      // les cas. On NE touche JAMAIS au display_name du compte : un pseudo n'est jamais
      // vide (auto-rempli a l'inscription, non videable) — le signalement 'name' suspend
      // seulement le deck concerne, l'auteur reste libre de renommer son pseudo lui-meme.
      await pool.query(
        `UPDATE collections SET visibility = 'private', share_token = NULL, updated_at = NOW() WHERE id = $1`,
        [deckId]
      );
      console.warn(`[decks] SUSPENDU par signalements : deck=${deckId} target=${target} (>=3 ip distinctes).`);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[decks] Erreur POST /report :', err.message);
    return res.status(200).json({ ok: true }); // neutre même en erreur
  }
});

module.exports = router;
