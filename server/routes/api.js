const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { CATEGORIES } = require('../categories');
const { COUNTRIES, DEPARTEMENTS_WITH_REGION, REGIONS, isValidDepartement } = require('../geo');
const { paramsFromQuery } = require('../params');
const { publicEventMessage } = require('../public-events');
const { authenticate } = require('../sessions');
const { safeFetchJson } = require('../safe-fetch');
// Cartes communautaires : joint au payload la part PUBLIQUE de la config du type
// (libellé de l'animal, choix de rayon) pour que cards.js n'ait aucun texte propre à
// un type en dur. Aucune requête supplémentaire — c'est une lecture d'un module JS.
// Les règles métier (dédup, expiration, seuil de clôture) restent côté serveur.
const { attachConfig: withCommunityConfig } = require('../community-types');

const router = express.Router();

// Liens de soutien financier (dons). Exposés au front pour activer les boutons
// PayPal / Ko-fi UNIQUEMENT si la variable d'environnement correspondante est
// posée côté serveur — activation indépendante de chacun, sans redéploiement de
// code. Valeur absente ou non-https → null : le bouton reste « bientôt ».
router.get('/support-links', (req, res) => {
  const clean = (v) => {
    const s = (v || '').trim();
    return /^https:\/\//i.test(s) ? s : null;
  };
  res.status(200).json({
    paypal: clean(process.env.PAYPAL_DONATE_URL),
    kofi: clean(process.env.KOFI_URL),
  });
});

// A1) Limiteur dédié aux votes « j'aime » : 20 actions/minute/IP (POST + DELETE
// partagent le compteur). Suffisant pour aimer plusieurs cartes d'affilée, bloque
// le spam scripté. S'ajoute au limiteur global /api (120/min/IP). Anti-abus v1 =
// ce rate-limit + marquage localStorage côté client (pas de dédup serveur par
// utilisateur, cf. rapport : un IP peut au pire ajouter ≤20 likes/min).
const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de votes, réessayez dans une minute' },
});

// Fusion v2 : ancien id départemental → source paramétrée (301 avec ?departement).
const OLD_VIG = /^vigilance-meteo-(.+)$/;
// Fusion v2 (vague 12) : anciens ids broadcast retirés → source paramétrée.
const FUSED_REDIRECTS = {
  'vigieau-gap': { to: 'vigieau', qs: 'commune=05061' },
  'vacances-zone-a': { to: 'vacances-scolaires', qs: 'zone=A' },
  'vacances-zone-b': { to: 'vacances-scolaires', qs: 'zone=B' },
  'vacances-zone-c': { to: 'vacances-scolaires', qs: 'zone=C' },
  'carburant-seuils': { to: 'carburant', qs: '' },
  'indice-uv-gap': { to: 'indice-uv', qs: 'departement=05' },
};
function redirectOldVig(id, suffix, res) {
  const m = id.match(OLD_VIG);
  if (m) {
    res.redirect(301, `/api/sources/vigilance-meteo/${suffix}?departement=${encodeURIComponent(m[1])}`);
    return true;
  }
  const f = FUSED_REDIRECTS[id];
  if (f) {
    res.redirect(301, `/api/sources/${f.to}/${suffix}${f.qs ? '?' + f.qs : ''}`);
    return true;
  }
  return false;
}

// GET /api/categories — taxonomie complète (publique, cacheable).
router.get('/categories', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(CATEGORIES);
});

// GET /api/geo — référentiel pays + départements (chaque dept porte sa région) + régions,
// pour la personnalisation (selects liés Pays→Région→Département). Cacheable.
router.get('/geo', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ countries: COUNTRIES, departements: DEPARTEMENTS_WITH_REGION, regions: REGIONS });
});

// GET /api/communes?departement=XX — suggestions de villes (noms de communes) pour la
// datalist de Mon compte. Le projet n'embarque AUCUNE base de communes (vigieau consomme
// des codes INSEE saisis, pas une liste de noms) → on relaie l'API publique officielle
// geo.api.gouv.fr, filtrée au département. Même origine côté client (la CSP connect-src
// reste 'self'). Le département est validé contre le référentiel (pas d'entrée libre vers
// l'URL distante). Cache mémoire + Cache-Control : le référentiel communal bouge très peu.
const communesCache = new Map(); // code dept → { at, names }
const COMMUNES_TTL_MS = 24 * 60 * 60 * 1000;
router.get('/communes', async (req, res) => {
  const dep = String(req.query.departement || '').trim();
  if (!isValidDepartement(dep)) return res.status(400).json({ error: 'Département invalide' });
  const cached = communesCache.get(dep);
  const now = Date.now();
  if (cached && now - cached.at < COMMUNES_TTL_MS) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json({ departement: dep, communes: cached.names });
  }
  try {
    const url = 'https://geo.api.gouv.fr/communes?codeDepartement=' +
      encodeURIComponent(dep) + '&fields=nom&format=json&limit=2000';
    const list = await safeFetchJson(url, { maxBytes: 512 * 1024, timeoutMs: 6000 });
    const names = (Array.isArray(list) ? list : [])
      .map((c) => (c && c.nom ? String(c.nom) : null))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    communesCache.set(dep, { at: now, names });
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json({ departement: dep, communes: names });
  } catch (err) {
    // Dégradation propre : le client retombe sur un champ texte libre (cf. rapport).
    return res.status(502).json({ error: 'Suggestions de villes indisponibles', communes: [] });
  }
});

// GET /api/sources — liste des sources avec leur état courant.
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.subtitle, s.description, s.description_long, s.badge, s.type, s.link_url,
              s.categories, s.submitted_by_github, s.params_schema,
              s.likes_count, s.created_at, s.forum_slug,
              CASE WHEN s.type = 'linked' THEN NULL
                   ELSE COALESCE(st.state, 'inactive') END AS state,
              (SELECT COUNT(*) FROM subscriptions sub
                 JOIN subscribers subr ON subr.id = sub.subscriber_id
                WHERE sub.source_id = s.id AND subr.confirmed = true)::int AS subscriber_count,
              (SELECT MAX(created_at) FROM source_events e
                WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at,
              -- Compte de discussions du verso (« On en parle au forum (N) → »). Porté par
              -- CETTE requête et pas par /api/forum/source/:slug/count, qui imposerait un
              -- fetch par carte. Sujets MASQUÉS exclus (hidden = false) : donnée strictement
              -- publique, même périmètre que le badge @forum_slug juste à côté.
              (SELECT COUNT(*) FROM forum_topics ft
                WHERE ft.hidden = false AND ft.source_id = s.id)::int AS topic_count
         FROM sources s
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE s.enabled = true
        ORDER BY s.display_order ASC, s.name ASC`
    );
    // Catalogue PUBLIC, identique pour tous (aucune donnée par-utilisateur : pas de token,
    // pas d'authenticate). Cacheable 60 s : allège les 3 sous-SELECT corrélés × ~290 lignes
    // sur une route à fort volume. Contrepartie ASSUMÉE : un like/topic_count qui vient de
    // changer peut mettre jusqu'à 60 s à apparaître à la navigation suivante — acceptable vu
    // le volume et la nature non critique de ces compteurs.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows.map(withCommunityConfig));
  } catch (err) {
    console.error('[api] Erreur GET /sources :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// ── LIKES : une ligne par (source, compte), plus jamais un compteur nu ───────────
// INTÉGRITÉ (14/08/2026) : likes_count était incrémenté sans aucune dédup serveur — la
// seule barrière était localStorage.lba-likes, contournable par un vidage de cache, un
// autre appareil ou un curl. La table source_likes (PK composite, patron favorites /
// community_report_spots) porte désormais la vérité ; likes_count n'est plus incrémenté
// mais RECALCULÉ depuis elle, DANS LA MÊME TRANSACTION que l'écriture de la ligne :
// une lecture concurrente ne peut donc jamais voir un compteur désaccordé de la table.
// CONSÉQUENCE ASSUMÉE : liker exige un compte (pas de subscriber_id anonyme = pas de
// dédup possible). L'anonyme voit le compteur mais reçoit un 401 s'il tente d'écrire.
// likeLimiter (20/min/IP) est CONSERVÉ en ceinture, malgré l'authentification.

// Écrit la ligne (INSERT idempotent ou DELETE) puis recale likes_count. Renvoie le
// compteur à jour, ou null si la source est inconnue/désactivée. Transaction unique.
async function applyLike(sourceId, subscriberId, liked) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const src = await client.query(
      'SELECT id FROM sources WHERE id = $1 AND enabled = true FOR UPDATE', [sourceId]);
    if (src.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    if (liked) {
      await client.query(
        `INSERT INTO source_likes (source_id, subscriber_id) VALUES ($1, $2)
         ON CONFLICT (source_id, subscriber_id) DO NOTHING`, [sourceId, subscriberId]);
      // Le like vaut aussi favori personnel (comportement d'origine conservé).
      await client.query(
        'INSERT INTO favorites (subscriber_id, source_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [subscriberId, sourceId]);
    } else {
      await client.query(
        'DELETE FROM source_likes WHERE source_id = $1 AND subscriber_id = $2', [sourceId, subscriberId]);
      await client.query(
        'DELETE FROM favorites WHERE subscriber_id = $1 AND source_id = $2', [subscriberId, sourceId]);
    }
    const { rows } = await client.query(
      `UPDATE sources SET likes_count = (SELECT COUNT(*) FROM source_likes WHERE source_id = $1)
        WHERE id = $1 RETURNING id, likes_count`, [sourceId]);
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* déjà rollback */ }
    throw err;
  } finally {
    client.release();
  }
}

// A1) POST /api/sources/:id/like — pose le « j'aime » du compte connecté (idempotent :
// re-liker ne change rien, la PK absorbe). 401 si anonyme.
router.post('/sources/:id/like', likeLimiter, async (req, res) => {
  const auth = await authenticate((req.body && req.body.token) || req.query.token);
  if (!auth) return res.status(401).json({ error: 'Connectez-vous pour aimer une alerte' });
  try {
    const row = await applyLike(req.params.id, auth.id, true);
    if (!row) return res.status(404).json({ error: 'Source inconnue' });
    res.json({ id: row.id, likes_count: row.likes_count });
  } catch (err) {
    console.error('[api] Erreur POST /sources/:id/like :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// A1) DELETE /api/sources/:id/like — retire le « j'aime » du compte connecté. Plus de
// GREATEST(-1, 0) : le compteur est recalculé, il ne peut structurellement pas dériver.
// NB : l'interface n'appelle plus cette route (le ❤ du kiosque retire le FAVORI via
// DELETE /api/favorites, découplage volontaire) — elle reste l'inverse exact du POST.
router.delete('/sources/:id/like', likeLimiter, async (req, res) => {
  const auth = await authenticate((req.body && req.body.token) || req.query.token);
  if (!auth) return res.status(401).json({ error: 'Connectez-vous pour gérer vos j\'aime' });
  try {
    const row = await applyLike(req.params.id, auth.id, false);
    if (!row) return res.status(404).json({ error: 'Source inconnue' });
    res.json({ id: row.id, likes_count: row.likes_count });
  } catch (err) {
    console.error('[api] Erreur DELETE /sources/:id/like :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// D) GET /api/favorites — cartes aimées de l'utilisateur connecté (enrichies, même
// forme que /api/sources → rendu client identique). Anonyme/token invalide → 401
// (la page /favoris bascule alors sur le localStorage lba-likes).
router.get('/favorites', async (req, res) => {
  const auth = await authenticate(req.query.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.subtitle, s.description, s.description_long, s.badge, s.type, s.link_url,
              s.categories, s.submitted_by_github, s.params_schema,
              s.likes_count, s.created_at, s.forum_slug,
              CASE WHEN s.type = 'linked' THEN NULL
                   ELSE COALESCE(st.state, 'inactive') END AS state,
              (SELECT COUNT(*) FROM subscriptions sub
                 JOIN subscribers subr ON subr.id = sub.subscriber_id
                WHERE sub.source_id = s.id AND subr.confirmed = true)::int AS subscriber_count,
              (SELECT MAX(created_at) FROM source_events e
                WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at,
              -- DOUBLON ASSUMÉ du SELECT de /api/sources (même forme exacte, rendu client
              -- identique) : toute colonne ajoutée là-bas doit l'être ici, sinon le même
              -- verso affiche le compte sur le kiosque et pas depuis les favoris.
              (SELECT COUNT(*) FROM forum_topics ft
                WHERE ft.hidden = false AND ft.source_id = s.id)::int AS topic_count
         FROM favorites f
         JOIN sources s ON s.id = f.source_id AND s.enabled = true
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE f.subscriber_id = $1
        ORDER BY f.created_at DESC`,
      [auth.id]
    );
    res.json(rows.map(withCommunityConfig)); // même enrichissement que /api/sources
  } catch (err) {
    console.error('[api] Erreur GET /favorites :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// D) POST /api/favorites/sync — remontée one-shot des favoris locaux (lba-likes) vers
// le serveur (idempotent). Rattrape les cœurs posés AVANT la table favorites et couvre
// le multi-appareils dans le sens montée. Corps : { token, ids: [source_id, ...] }.
router.post('/favorites/sync', async (req, res) => {
  const body = req.body || {};
  const auth = await authenticate(body.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x) => typeof x === 'string' && x).slice(0, 1000)
    : [];
  if (!ids.length) return res.status(200).json({ synced: 0 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // (1) Favori personnel (« Ma collection ») — SELECT depuis sources → ignore les ids
    // inconnus/désactivés (pas de violation de FK). Idempotent (ON CONFLICT DO NOTHING).
    const fav = await client.query(
      `INSERT INTO favorites (subscriber_id, source_id)
         SELECT $1, s.id FROM sources s WHERE s.id = ANY($2::text[]) AND s.enabled = true
       ON CONFLICT DO NOTHING`,
      [auth.id, ids]
    );
    // (2) CRÉDIT DES LIKES POSÉS AVANT CONNEXION : les cœurs en localStorage (lba-likes)
    // deviennent des likes RÉELS du compte fraîchement authentifié. Ce N'EST PAS un vote
    // anonyme temps réel (fermé le 14/08) : au moment de la sync, un subscriber_id réel et
    // authentifié existe déjà. Dédup par la PK (source_id, subscriber_id), ON CONFLICT DO
    // NOTHING (même patron que POST /like) → idempotent, aucune double insertion.
    const liked = await client.query(
      `INSERT INTO source_likes (source_id, subscriber_id)
         SELECT s.id, $1 FROM sources s WHERE s.id = ANY($2::text[]) AND s.enabled = true
       ON CONFLICT (source_id, subscriber_id) DO NOTHING
       RETURNING source_id`,
      [auth.id, ids]
    );
    // (3) Recale likes_count = COUNT(source_likes) UNIQUEMENT pour les sources réellement
    // créditées (RETURNING) — même patron que POST/DELETE /like, même transaction. Une sync
    // rejouée n'insère rien (ON CONFLICT) → changed vide → aucun UPDATE, compteur intact.
    const changed = liked.rows.map((r) => r.source_id);
    if (changed.length) {
      await client.query(
        `UPDATE sources SET likes_count = (SELECT COUNT(*) FROM source_likes sl WHERE sl.source_id = sources.id)
          WHERE id = ANY($1::text[])`,
        [changed]
      );
    }
    await client.query('COMMIT');
    res.json({ synced: fav.rowCount, liked: liked.rowCount });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* déjà rollback */ }
    console.error('[api] Erreur POST /favorites/sync :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  } finally {
    client.release();
  }
});

// D) DELETE /api/favorites — retire un favori personnel de « Ma collection », SANS toucher
// sources.likes_count (le compteur public de ❤). Distinct du DELETE /sources/:id/like :
// « Ma collection » contient aussi des favoris posés AUTOMATIQUEMENT par un abonnement,
// jamais « likés » → les décompter du compteur public fausserait les chiffres affichés.
// Idempotent (0 ligne supprimée si déjà retiré). Corps : { token, source_id }.
router.delete('/favorites', async (req, res) => {
  const body = req.body || {};
  const auth = await authenticate(body.token || req.query.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const sourceId = body.source_id || req.query.source_id;
  if (!sourceId || typeof sourceId !== 'string') return res.status(400).json({ error: 'source_id requis' });
  try {
    await pool.query('DELETE FROM favorites WHERE subscriber_id = $1 AND source_id = $2', [auth.id, sourceId]);
    res.json({ removed: true, source_id: sourceId });
  } catch (err) {
    console.error('[api] Erreur DELETE /favorites :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// B2) GET /api/sources/:id/links — liens de visibilité pro du déposant, pour la
// page publique de la source UNIQUEMENT (jamais dans la liste /api/sources). Les
// liens sont re-validés/assainis à l'affichage (défense en profondeur, même si le
// dépôt valide déjà) : on ne renvoie que des URL http(s) bien formées, label borné,
// 3 max. Aucune donnée sensible (pas d'email).
function isSafeHttpUrl(u) {
  if (typeof u !== 'string' || u.length === 0 || u.length > 300) return false;
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; }
  catch (e) { return false; }
}
function sanitizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && typeof l.label === 'string' && l.label.trim().length > 0 && l.label.length <= 60 && isSafeHttpUrl(l.url))
    .slice(0, 3)
    .map((l) => ({ label: l.label.trim().slice(0, 60), url: l.url }));
}
router.get('/sources/:id/links', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT submitted_links FROM sources WHERE id = $1 AND enabled = true', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ submitted_links: sanitizeLinks(rows[0].submitted_links) });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/links :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/alert.json — manifeste OpenAlert d'une source.
// Paramétrée : ?departement=05 lit source_param_states de la combinaison.
router.get('/sources/:id/alert.json', async (req, res) => {
  try {
    if (redirectOldVig(req.params.id, 'alert.json', res)) return;
    const base = await pool.query('SELECT id, name, type, params_schema FROM sources WHERE id = $1', [req.params.id]);
    if (base.rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }
    const s = base.rows[0];
    // Les sources liées (services partenaires) n'ont pas de manifeste OpenAlert.
    if (s.type === 'linked') {
      return res.status(404).json({
        error: 'Cette source est un service externe lié, sans manifeste OpenAlert',
      });
    }

    const schema = s.params_schema || null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;
    const stateRes = params
      ? await pool.query(
          `SELECT state, since, until_date, message, url, checked_at
             FROM source_param_states WHERE source_id = $1 AND params = $2::jsonb`,
          [s.id, JSON.stringify(params)])
      : await pool.query(
          `SELECT state, since, until_date, message, url, checked_at
             FROM source_states WHERE source_id = $1`, [s.id]);
    const r = stateRes.rows[0] || {};

    res.json({
      id: s.id,
      name: s.name,
      state: r.state || 'inactive',
      since: r.since ? r.since.toISOString() : null,
      until: r.until_date ? r.until_date.toISOString() : null,
      message: r.message ?? null,
      url: r.url ?? null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/alert.json :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/history — 50 derniers events + 90 jours d'uptime.
// Sources paramétrées : ?departement=05 (etc.) filtre l'historique sur la
// combinaison (source_param_states / source_events.params). Sans param valide,
// on retombe sur le chemin broadcast (source_states) — inchangé.
router.get('/sources/:id/history', async (req, res) => {
  const id = req.params.id;
  try {
    if (redirectOldVig(id, 'history', res)) return;
    const schemaRes = await pool.query('SELECT params_schema FROM sources WHERE id = $1', [id]);
    if (schemaRes.rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });
    const schema = schemaRes.rows[0].params_schema || null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;

    const src = await pool.query(
      params
        ? `SELECT s.created_at, COALESCE(sps.state,'inactive') AS state
             FROM sources s LEFT JOIN source_param_states sps
               ON sps.source_id = s.id AND sps.params = $2::jsonb
            WHERE s.id = $1`
        : `SELECT s.created_at, COALESCE(st.state,'inactive') AS state
             FROM sources s LEFT JOIN source_states st ON st.source_id = s.id
            WHERE s.id = $1`,
      params ? [id, JSON.stringify(params)] : [id]
    );
    if (src.rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });
    const createdAt = new Date(src.rows[0].created_at);

    // Filtre événementiel : par combinaison si paramétré, sinon broadcast (params NULL).
    const paramFilter = params ? 'AND params = $2::jsonb' : '';
    const evArgs = params ? [id, JSON.stringify(params)] : [id];

    const evRes = await pool.query(
      `SELECT event, message, created_at FROM source_events
        WHERE source_id = $1 ${paramFilter} ORDER BY created_at DESC LIMIT 50`,
      evArgs
    );
    // FUITE CORRIGEE : cette route est publique (aucun compte requis) et renvoyait
    // r.message brut, donc le diagnostic technique des evenements 'failed'.
    // publicEventMessage garde le texte des 'activated' (contenu d'alerte, affiche par
    // timeline.js) et remplace le reste par un libelle publiable. Le message technique
    // reste en base pour les rapports du Robot 1.
    const events = evRes.rows.map((r) => ({
      event: r.event,
      message: publicEventMessage(r.event, r.message),
      created_at: r.created_at.toISOString(),
    }));

    // Tous les events (asc) pour reconstruire les intervalles actifs + compter les échecs.
    const allRes = await pool.query(
      `SELECT event, created_at FROM source_events
        WHERE source_id = $1 ${paramFilter} ORDER BY created_at ASC`,
      evArgs
    );
    const all = allRes.rows;

    // Intervalles [début, fin] où la source était active.
    const intervals = [];
    let openStart = null;
    for (const e of all) {
      const t = new Date(e.created_at);
      if (e.event === 'activated' && openStart === null) openStart = t;
      else if (e.event === 'deactivated' && openStart !== null) { intervals.push([openStart, t]); openStart = null; }
    }
    if (openStart !== null) intervals.push([openStart, new Date()]);

    // Si l'état courant est actif mais aucun event (données anciennes), couvrir aujourd'hui.
    if (src.rows[0].state === 'active' && intervals.length === 0) {
      intervals.push([new Date(Date.now() - 86400000), new Date()]);
    }

    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 89; i >= 0; i--) {
      const dayStart = new Date(today); dayStart.setDate(today.getDate() - i);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
      const dateStr = dayStart.toISOString().slice(0, 10);
      let status;
      if (dayEnd <= createdAt) {
        status = 'nodata';
      } else {
        const failCount = all.filter((e) => e.event === 'failed' &&
          new Date(e.created_at) >= dayStart && new Date(e.created_at) < dayEnd).length;
        if (failCount >= 3) status = 'failed';
        else if (intervals.some(([a, b]) => a < dayEnd && b >= dayStart)) status = 'active';
        else status = 'calm';
      }
      days.push({ date: dateStr, status });
    }

    res.json({ events, days });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/history :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/stats — chiffres du mois courant pour le bloc marketing.
router.get('/stats', async (req, res) => {
  try {
    const d = new Date();
    const mk = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();

    const counters = await pool.query('SELECT key, value FROM counters');
    const cmap = {};
    counters.rows.forEach((r) => { cmap[r.key] = Number(r.value); });

    const alerts = await pool.query(
      `SELECT COUNT(*)::int AS n FROM source_events WHERE event = 'activated' AND created_at >= $1`,
      [monthStart]
    );
    const srcCount = await pool.query('SELECT COUNT(*)::int AS n FROM sources WHERE enabled = true');

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      checks_this_month: cmap['checks_' + mk] || 0,
      emails_this_month: cmap['emails_' + mk] || 0,
      alerts_this_month: alerts.rows[0].n,
      sources_count: srcCount.rows[0].n,
    });
  } catch (err) {
    console.error('[api] Erreur GET /stats :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/badge.svg — badge SVG dynamique auto-contenu.
router.get('/sources/:id/badge.svg', async (req, res) => {
  try {
    const id = req.params.id;
    if (redirectOldVig(id, 'badge.svg', res)) return;
    const schemaRes = await pool.query('SELECT params_schema FROM sources WHERE id = $1 AND enabled = true', [id]);
    const schema = schemaRes.rows.length ? (schemaRes.rows[0].params_schema || null) : null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;

    const { rows } = await pool.query(
      params
        ? `SELECT s.name, COALESCE(sps.state,'inactive') AS state
             FROM sources s LEFT JOIN source_param_states sps
               ON sps.source_id = s.id AND sps.params = $2::jsonb
            WHERE s.id = $1 AND s.enabled = true`
        : `SELECT s.name, COALESCE(st.state,'inactive') AS state
             FROM sources s LEFT JOIN source_states st ON st.source_id = s.id
            WHERE s.id = $1 AND s.enabled = true`,
      params ? [id, JSON.stringify(params)] : [id]
    );
    // Dernier event pour distinguer « erreur » du calme.
    let recentFailed = false;
    if (rows.length) {
      const ev = await pool.query(
        `SELECT event, created_at FROM source_events
          WHERE source_id = $1 ${params ? 'AND params = $2::jsonb' : ''} ORDER BY created_at DESC LIMIT 1`,
        params ? [id, JSON.stringify(params)] : [id]
      );
      const last = ev.rows[0];
      recentFailed = last && last.event === 'failed' && (Date.now() - new Date(last.created_at).getTime()) < 5400_000;
    }

    let label = 'calme', color = '#9aa3ad';
    if (rows.length) {
      if (rows[0].state === 'active') { label = 'active'; color = '#22c55e'; }
      else if (recentFailed) { label = 'erreur'; color = '#f5a623'; }
    }
    const name = rows.length ? rows[0].name : 'source inconnue';
    const shortName = (name.length > 22 ? name.slice(0, 21) + '…' : name);

    function xesc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="44" viewBox="0 0 260 44" role="img" aria-label="${xesc(name)} : ${label}">
  <rect width="260" height="44" rx="10" fill="#161d24"/>
  <text x="16" y="19" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#a567e3">labonnealerte</text>
  <text x="16" y="33" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#f2efe9">${xesc(shortName)}</text>
  <circle cx="222" cy="22" r="5" fill="${color}"/>
  <text x="234" y="26" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (err) {
    console.error('[api] Erreur GET /badge.svg :', err.message);
    res.status(503).send('');
  }
});

// GET /api/status — compat : état de leboncoin-livraison au format historique.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT state, since, until_date, checked_at
         FROM source_states
        WHERE source_id = 'leboncoin-livraison'`
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun statut en base' });
    }

    const r = rows[0];
    res.json({
      active: r.state === 'active',
      pending: r.state === 'pending',
      date_debut: r.since ? r.since.toISOString() : null,
      date_fin: r.until_date ? r.until_date.toISOString() : null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /status :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

module.exports = router;
