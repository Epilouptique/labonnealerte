// Forum communautaire maison (MVP) — monté à la racine (/forum) + un endpoint
// JSON (/api/forum/...). Aucune nouvelle brique : même Postgres, même session
// que le site (authenticate(token) appelée en tête de route, comme decks.js),
// rendu server-side par template strings (style emailShell, aucun moteur de vue).
//
//  Lectures publiques (HTML) : accueil, catégorie, sujets tagués source, sujet.
//  Écritures (auth + rate-limit + validation) : créer sujet, répondre, signaler.
//  Admin (auth + is_admin) : masquer/démasquer, verrouiller/déverrouiller.
//
// Le lien carte→forum N'est PAS câblé ici (chantier séparé) ; la route
// /forum/source/:slug existe déjà pour le desservir plus tard.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { validateForumTitle, validateForumBody, hashIp } = require('../ugc');
const { clientIp } = require('../profile-autofill');
const mailer = require('../mailer');

const router = express.Router();

const SITE_URL = 'https://labonnealerte.fr';
const REPORT_HIDE_THRESHOLD = 3;   // auto-masquage d'un message à ce nombre de signalements
const TOPICS_PER_PAGE = 30;
const POSTS_PER_PAGE = 20;

// 5 catégories fixes (slug → libellé). Le CHECK SQL porte la même liste de slugs.
const CATEGORIES = {
  discussion:   'Discussion libre',
  propositions: 'Propositions',
  dev:          'Espace dev',
  entraide:     'Entraide',
  suggestions:  'Suggestions',
};
function isCategory(c) { return Object.prototype.hasOwnProperty.call(CATEGORIES, c); }

/* ------------------------------------------------------------------ */
/* Rate-limit mémoire par compte — deux compteurs distincts.           */
/* (copie locale, comme la convention decks.js / dev.js)               */
/* ------------------------------------------------------------------ */
const WINDOW_MS = 60 * 60 * 1000; // 1 h
function makeLimiter(maxOps) {
  const hits = new Map(); // subscriberId -> [timestamps]
  setInterval(() => {
    const now = Date.now();
    for (const [id, arr] of hits) {
      const recent = arr.filter((t) => now - t < WINDOW_MS);
      if (recent.length) hits.set(id, recent); else hits.delete(id);
    }
  }, WINDOW_MS).unref();
  return function rateOk(id) {
    const now = Date.now();
    const recent = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= maxOps) { hits.set(id, recent); return false; }
    recent.push(now); hits.set(id, recent); return true;
  };
}
const rateOkTopic = makeLimiter(5);  // 5 sujets / h / compte
const rateOkReply = makeLimiter(15); // 15 réponses / h / compte

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Corps multi-lignes : échappé PUIS \n → <br> (aucune injection possible).
function bodyToHtml(s) { return escHtml(s).replace(/\n/g, '<br>'); }

// Slug : translittération simple + suffixe aléatoire → unicité quasi garantie
// (l'index unique reste le garde-fou dur). Borné à 160 (VARCHAR(160)).
function slugify(title) {
  const base = String(title).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
    || 'sujet';
  return (base + '-' + crypto.randomBytes(3).toString('hex')).slice(0, 160);
}

function readToken(req) { return (req.body && req.body.token) || req.query.token; }

// Récupère l'auteur du token, ou null (401 géré par l'appelant).
async function requireAuth(req, res) {
  const auth = await authenticate(readToken(req));
  if (!auth) { res.status(401).json({ error: 'Connexion requise' }); return null; }
  return auth;
}
// Auth + is_admin (une requête ; is_admin n'est pas porté par authenticate()).
async function requireAdmin(req, res) {
  const auth = await authenticate(readToken(req));
  if (!auth) { res.status(401).json({ error: 'Connexion requise' }); return null; }
  const { rows } = await pool.query('SELECT is_admin FROM subscribers WHERE id = $1', [auth.id]);
  if (!rows.length || rows[0].is_admin !== true) { res.status(403).json({ error: 'Réservé à la modération' }); return null; }
  return auth;
}

// Résout le paramètre d'URL d'une source vers son id CANONIQUE (= forum_topics.source_id).
// Priorité au slug public stable `forum_slug`, repli sur `sources.id` → rétrocompat
// totale (aucun lien par id cassé). Source inconnue : renvoie le paramètre tel quel
// (la requête sur source_id donnera alors une liste vide, comme avant).
async function resolveSourceId(param) {
  const bySlug = await pool.query('SELECT id FROM sources WHERE forum_slug = $1', [param]);
  if (bySlug.rows.length) return bySlug.rows[0].id;
  const byId = await pool.query('SELECT id FROM sources WHERE id = $1', [param]);
  if (byId.rows.length) return byId.rows[0].id;
  return param;
}

/* ------------------------------------------------------------------ */
/* Rendu HTML (template strings, style cohérent avec le site)          */
/* ------------------------------------------------------------------ */
function page(title, inner) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;
       padding:24px 16px 64px;color:#0f1419;background:#fdfaff;line-height:1.55}
  a{color:#a567e3;text-decoration:none} a:hover{text-decoration:underline}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
  h1{font-size:22px;margin:0 0 4px;letter-spacing:-0.02em}
  .cats{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 26px}
  .cats a{background:#f1e8fb;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:600}
  .topic{padding:12px 0;border-bottom:1px solid #eee}
  .topic .t-title{font-weight:600;font-size:16px}
  .topic .t-meta{font-size:12px;color:#6b6459;margin-top:2px}
  .post{padding:14px 0;border-bottom:1px solid #eee}
  .post .p-meta{font-size:12px;color:#6b6459;margin-bottom:6px}
  .badge{display:inline-block;background:#eae0fb;color:#6b4ea8;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:600}
  .muted{color:#8a8a92} .empty{color:#8a8a92;padding:24px 0}
</style></head><body>
<header><div><a href="/">← La Bonne Alerte</a></div><div class="muted" style="font-size:13px">Forum</div></header>
${inner}
</body></html>`;
}

function topicRow(t) {
  const cat = CATEGORIES[t.category] || t.category;
  const src = t.source_id ? ` · <span class="badge">@${escHtml(t.source_id)}</span>` : '';
  const when = new Date(t.last_reply_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const n = t.reply_count;
  return `<div class="topic">
    <div class="t-title"><a href="/forum/t/${escHtml(t.slug)}">${escHtml(t.title)}</a></div>
    <div class="t-meta">${escHtml(cat)}${src} · ${n} réponse${n > 1 ? 's' : ''} · ${escHtml(when)}</div>
  </div>`;
}

function categoriesNav() {
  return '<div class="cats">' + Object.keys(CATEGORIES).map((slug) =>
    `<a href="/forum/c/${slug}">${escHtml(CATEGORIES[slug])}</a>`).join('') + '</div>';
}

function html404(res, msg) {
  return res.status(404).type('html').send(page('Introuvable',
    `<h1>Introuvable</h1><p class="empty">${escHtml(msg || 'Cette page n\'existe pas.')}</p>
     <p><a href="/forum">← Retour au forum</a></p>`));
}

/* ================================================================== */
/* LECTURES PUBLIQUES (HTML)                                           */
/* ================================================================== */

// Accueil : catégories + derniers sujets actifs (non masqués).
router.get('/forum', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, category, source_id, reply_count, last_reply_at
         FROM forum_topics WHERE hidden = false
        ORDER BY last_reply_at DESC LIMIT $1`, [TOPICS_PER_PAGE]);
    const list = rows.length ? rows.map(topicRow).join('') : '<p class="empty">Aucun sujet pour le moment.</p>';
    res.type('html').send(page('Forum · La Bonne Alerte',
      `<h1>Forum</h1><p class="muted">Discussions de la communauté.</p>
       ${categoriesNav()}<h2 style="font-size:15px">Sujets récents</h2>${list}`));
  } catch (err) {
    console.error('[forum] GET /forum :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujets d'une catégorie (404 si hors enum).
router.get('/forum/c/:category', async (req, res) => {
  const cat = req.params.category;
  if (!isCategory(cat)) return html404(res, 'Catégorie inconnue.');
  const page_ = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, category, source_id, reply_count, last_reply_at
         FROM forum_topics WHERE hidden = false AND category = $1
        ORDER BY last_reply_at DESC LIMIT $2 OFFSET $3`,
      [cat, TOPICS_PER_PAGE, (page_ - 1) * TOPICS_PER_PAGE]);
    const list = rows.length ? rows.map(topicRow).join('') : '<p class="empty">Aucun sujet dans cette catégorie.</p>';
    res.type('html').send(page(`${CATEGORIES[cat]} · Forum`,
      `<h1>${escHtml(CATEGORIES[cat])}</h1>${categoriesNav()}${list}`));
  } catch (err) {
    console.error('[forum] GET /forum/c :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujets tagués à une source (cible du futur lien carte).
router.get('/forum/source/:slug', async (req, res) => {
  const sid = req.params.slug;
  try {
    const canonicalId = await resolveSourceId(sid); // forum_slug prioritaire, repli id
    const { rows } = await pool.query(
      `SELECT slug, title, category, source_id, reply_count, last_reply_at
         FROM forum_topics WHERE hidden = false AND source_id = $1
        ORDER BY last_reply_at DESC LIMIT $2`, [canonicalId, TOPICS_PER_PAGE]);
    const list = rows.length ? rows.map(topicRow).join('') : '<p class="empty">Aucune discussion sur cette source pour le moment.</p>';
    res.type('html').send(page(`Discussions · ${sid} · Forum`,
      `<h1>Discussions : <span class="badge">@${escHtml(sid)}</span></h1>
       <p><a href="/forum">← Forum</a></p>${list}`));
  } catch (err) {
    console.error('[forum] GET /forum/source :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujet + messages paginés (404 si masqué). Messages masqués filtrés.
router.get('/forum/t/:slug', async (req, res) => {
  const slug = req.params.slug;
  const page_ = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const t = await pool.query(
      `SELECT id, title, category, source_id, locked, hidden FROM forum_topics WHERE slug = $1`, [slug]);
    if (!t.rows.length || t.rows[0].hidden) return html404(res, 'Sujet introuvable.');
    const topic = t.rows[0];
    const p = await pool.query(
      `SELECT fp.id, fp.body, fp.created_at, COALESCE(s.display_name, 'Membre') AS author
         FROM forum_posts fp JOIN subscribers s ON s.id = fp.author_subscriber_id
        WHERE fp.topic_id = $1 AND fp.hidden = false
        ORDER BY fp.created_at ASC LIMIT $2 OFFSET $3`,
      [topic.id, POSTS_PER_PAGE, (page_ - 1) * POSTS_PER_PAGE]);
    const posts = p.rows.map((post) => {
      const when = new Date(post.created_at).toLocaleString('fr-FR',
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="post"><div class="p-meta">${escHtml(post.author)} · ${escHtml(when)}</div>
        <div>${bodyToHtml(post.body)}</div></div>`;
    }).join('') || '<p class="empty">Aucun message.</p>';
    const src = topic.source_id ? ` · <span class="badge">@${escHtml(topic.source_id)}</span>` : '';
    const lock = topic.locked ? ' · <span class="muted">🔒 verrouillé</span>' : '';
    res.type('html').send(page(`${topic.title} · Forum`,
      `<h1>${escHtml(topic.title)}</h1>
       <p class="t-meta">${escHtml(CATEGORIES[topic.category] || topic.category)}${src}${lock}</p>
       <p><a href="/forum/c/${escHtml(topic.category)}">← ${escHtml(CATEGORIES[topic.category] || 'Retour')}</a></p>
       ${posts}`));
  } catch (err) {
    console.error('[forum] GET /forum/t :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Compteur JSON pour un futur badge « N discussions » (requête légère).
router.get('/api/forum/source/:slug/count', async (req, res) => {
  try {
    const canonicalId = await resolveSourceId(req.params.slug); // forum_slug prioritaire, repli id
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM forum_topics WHERE hidden = false AND source_id = $1`,
      [canonicalId]);
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[forum] GET count :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ================================================================== */
/* ÉCRITURES (auth + rate-limit + validation)                          */
/* ================================================================== */

// Créer un sujet (+ 1er message) en transaction.
router.post('/forum/t', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  if (!rateOkTopic(auth.id)) return res.status(429).json({ error: 'Trop de sujets créés récemment, réessayez plus tard.' });

  const category = (req.body && req.body.category) || '';
  if (!isCategory(category)) return res.status(400).json({ error: 'Catégorie invalide' });
  const title = validateForumTitle(req.body && req.body.title);
  if (!title.ok) return res.status(400).json({ error: 'Titre : ' + title.error });
  const body = validateForumBody(req.body && req.body.body);
  if (!body.ok) return res.status(400).json({ error: 'Message : ' + body.error });

  // source_id optionnel : doit exister dans sources.
  let sourceId = (req.body && req.body.source_id) || null;
  if (sourceId != null) {
    sourceId = String(sourceId);
    const s = await pool.query('SELECT 1 FROM sources WHERE id = $1', [sourceId]);
    if (!s.rows.length) return res.status(400).json({ error: 'Source inconnue' });
  }

  const slug = slugify(title.value);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(
      `INSERT INTO forum_topics (category, title, slug, author_subscriber_id, source_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, slug`,
      [category, title.value, slug, auth.id, sourceId]);
    await client.query(
      `INSERT INTO forum_posts (topic_id, author_subscriber_id, body) VALUES ($1, $2, $3)`,
      [t.rows[0].id, auth.id, body.value]);
    await client.query('COMMIT');
    res.status(201).json({ slug: t.rows[0].slug, url: `/forum/t/${t.rows[0].slug}` });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* déjà rollback */ }
    console.error('[forum] POST /forum/t :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  } finally {
    client.release();
  }
});

// Répondre à un sujet + notif email à l'auteur du sujet.
router.post('/forum/t/:id/reply', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  if (!rateOkReply(auth.id)) return res.status(429).json({ error: 'Trop de réponses récentes, réessayez plus tard.' });
  const topicId = parseInt(req.params.id, 10);
  if (!Number.isInteger(topicId)) return res.status(400).json({ error: 'Sujet invalide' });
  const body = validateForumBody(req.body && req.body.body);
  if (!body.ok) return res.status(400).json({ error: 'Message : ' + body.error });

  let notify = null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(
      `SELECT id, title, slug, locked, hidden, author_subscriber_id
         FROM forum_topics WHERE id = $1 FOR UPDATE`, [topicId]);
    if (!t.rows.length || t.rows[0].hidden) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Sujet introuvable' }); }
    if (t.rows[0].locked) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Sujet verrouillé' }); }

    await client.query(
      `INSERT INTO forum_posts (topic_id, author_subscriber_id, body) VALUES ($1, $2, $3)`,
      [topicId, auth.id, body.value]);
    await client.query(
      `UPDATE forum_topics SET last_reply_at = NOW(), reply_count = reply_count + 1 WHERE id = $1`,
      [topicId]);
    await client.query('COMMIT');

    // Notif l'auteur du sujet (sauf s'il se répond à lui-même). Non bloquant.
    if (t.rows[0].author_subscriber_id !== auth.id) {
      notify = { topicTitle: t.rows[0].title, slug: t.rows[0].slug, authorId: t.rows[0].author_subscriber_id };
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* déjà rollback */ }
    console.error('[forum] POST reply :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  } finally {
    client.release();
  }

  if (notify) {
    try {
      const a = await pool.query('SELECT email, token, display_name FROM subscribers WHERE id = $1', [notify.authorId]);
      if (a.rows.length && a.rows[0].email) {
        mailer.sendForumReplyNotification(
          { email: a.rows[0].email, token: a.rows[0].token },
          { topicTitle: notify.topicTitle, topicUrl: `${SITE_URL}/forum/t/${notify.slug}`,
            replierName: null }
        ).catch((e) => console.error('[forum] notif :', e.message));
      }
    } catch (e) { console.error('[forum] notif lookup :', e.message); }
  }
});

// Signaler un message : auth requise + IP hachée, anti-doublon (post, ip),
// auto-masquage au seuil. Tout en transaction.
router.post('/forum/post/:id/report', async (req, res) => {
  const auth = await requireAuth(req, res); if (!auth) return;
  const postId = parseInt(req.params.id, 10);
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Message invalide' });
  const ipHash = hashIp(clientIp(req));
  const reason = (req.body && typeof req.body.reason === 'string') ? req.body.reason.slice(0, 40) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM forum_posts WHERE id = $1 FOR UPDATE', [postId]);
    if (!exists.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Message introuvable' }); }
    const ins = await client.query(
      `INSERT INTO forum_reports (post_id, reporter_ip_hash, reporter_subscriber_id, reason)
       VALUES ($1, $2, $3, $4) ON CONFLICT (post_id, reporter_ip_hash) DO NOTHING RETURNING id`,
      [postId, ipHash, auth.id, reason]);
    if (!ins.rows.length) { await client.query('COMMIT'); return res.status(200).json({ ok: true, duplicate: true }); }
    const upd = await client.query(
      `UPDATE forum_posts SET report_count = report_count + 1 WHERE id = $1 RETURNING report_count`, [postId]);
    let hidden = false;
    if (upd.rows[0].report_count >= REPORT_HIDE_THRESHOLD) {
      await client.query('UPDATE forum_posts SET hidden = true WHERE id = $1', [postId]);
      hidden = true;
    }
    await client.query('COMMIT');
    res.status(200).json({ ok: true, hidden });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* déjà rollback */ }
    console.error('[forum] POST report :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  } finally {
    client.release();
  }
});

/* ================================================================== */
/* ADMIN (auth + is_admin)                                             */
/* ================================================================== */
function setPostHidden(hidden) {
  return async (req, res) => {
    const auth = await requireAdmin(req, res); if (!auth) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Message invalide' });
    try {
      const r = await pool.query('UPDATE forum_posts SET hidden = $1 WHERE id = $2 RETURNING id', [hidden, id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Message introuvable' });
      res.json({ ok: true, hidden });
    } catch (err) { console.error('[forum] admin post :', err.message); res.status(503).json({ error: 'Service indisponible' }); }
  };
}
function setTopicFlag(column, value) {
  return async (req, res) => {
    const auth = await requireAdmin(req, res); if (!auth) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Sujet invalide' });
    try {
      // column est une constante littérale ('hidden' | 'locked'), jamais une entrée utilisateur.
      const r = await pool.query(`UPDATE forum_topics SET ${column} = $1 WHERE id = $2 RETURNING id`, [value, id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Sujet introuvable' });
      res.json({ ok: true, [column]: value });
    } catch (err) { console.error('[forum] admin topic :', err.message); res.status(503).json({ error: 'Service indisponible' }); }
  };
}
router.post('/forum/admin/post/:id/hide',    setPostHidden(true));
router.post('/forum/admin/post/:id/unhide',  setPostHidden(false));
router.post('/forum/admin/topic/:id/hide',   setTopicFlag('hidden', true));
router.post('/forum/admin/topic/:id/unhide', setTopicFlag('hidden', false));
router.post('/forum/admin/topic/:id/lock',   setTopicFlag('locked', true));
router.post('/forum/admin/topic/:id/unlock', setTopicFlag('locked', false));

module.exports = router;
