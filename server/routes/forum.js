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

// Miroir pour les DECKS (collections). Espace de noms séparé : forum_slug prioritaire,
// repli sur collections.id, sinon le paramètre tel quel (liste vide).
async function resolveDeckId(param) {
  const bySlug = await pool.query('SELECT id FROM collections WHERE forum_slug = $1', [param]);
  if (bySlug.rows.length) return bySlug.rows[0].id;
  const byId = await pool.query('SELECT id FROM collections WHERE id = $1', [param]);
  if (byId.rows.length) return byId.rows[0].id;
  return param;
}

/* ------------------------------------------------------------------ */
/* Rendu HTML (template strings ; identité visuelle du site via         */
/* tokens.css + site.css — mêmes assets/scripts que les pages           */
/* secondaires statiques, cf. public/favoris.html).                     */
/* ------------------------------------------------------------------ */

// Descriptions éditoriales des 5 catégories (ton du site : bref, chaleureux).
const CAT_META = {
  discussion:   { emoji: '💬', desc: 'Le coin détente : on parle de tout, sans ordre du jour.' },
  propositions: { emoji: '💡', desc: 'Une source ou une alerte qui manque ? Proposez-la ici.' },
  dev:          { emoji: '⚙️', desc: 'OpenAlert, API, contributions : la cuisine technique du projet.' },
  entraide:     { emoji: '🤝', desc: 'Une question, un réglage qui coince ? On s\'entraide.' },
  suggestions:  { emoji: '✨', desc: 'Vos idées pour améliorer le site, en vrac et bienvenues.' },
};

// Icônes trait 2px stroke currentColor (même style que les cartes du kiosque).
const REPLY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const FLAG_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';

// Date relative en français (helper local ; aucun util équivalent côté serveur vérifié).
function relativeTime(d) {
  const then = new Date(d).getTime();
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); if (j < 30) return `il y a ${j} j`;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Layout commun (head + header injecté par header.js + footer + scripts partagés).
function forumShell(title, inner, opts) {
  opts = opts || {};
  const bc = opts.breadcrumb ? `<nav class="forum-breadcrumb" aria-label="Fil d'Ariane">${opts.breadcrumb}</nav>` : '';
  return `<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(opts.desc || 'Le forum de la communauté La Bonne Alerte.')}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/site.css">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#fdfaff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1419" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
</head>
<body>
<header>
  <!-- Header injecté par js/header.js (source unique). Ancre minimale. -->
  <div class="wrap nav"></div>
</header>
<main class="forum-main">
${bc}
${inner}
</main>
<footer>
  La Bonne Alerte — gratuit, open-source (MIT), sans spam, rien de caché.<br>
  <a href="/">Kiosque</a> · <a href="/a-propos">À propos</a> · <a href="/soutenir">Nous soutenir</a> · <a href="/mentions-legales">Mentions légales</a> · <a href="/confidentialite">Confidentialité</a> · <a href="/proposer">Espace développeur</a>
</footer>
<script src="/js/session.js"></script>
<script src="/js/categories.js"></script>
<script src="/js/theme.js"></script>
<script src="/js/header.js"></script>
<script src="/js/forum.js"></script>
${(opts.scripts || []).map((src) => `<script src="${src}"></script>`).join('\n')}
<script src="/js/pwa.js"></script>
</body>
</html>`;
}

// SELECT commun d'une liste de sujets (jointures forum_slug source/deck + auteur).
const TOPIC_SELECT = `
  SELECT ft.slug, ft.title, ft.category, ft.reply_count, ft.last_reply_at, ft.locked,
         ft.source_id, ft.deck_id,
         s.forum_slug AS source_slug, s.name AS source_name,
         c.forum_slug AS deck_slug, c.name AS deck_name,
         c.share_token AS deck_token, c.owner_subscriber_id AS deck_owner,
         COALESCE(au.display_name, 'Membre') AS author, au.pseudo AS author_pseudo
    FROM forum_topics ft
    JOIN subscribers au ON au.id = ft.author_subscriber_id
    LEFT JOIN sources s ON s.id = ft.source_id
    LEFT JOIN collections c ON c.id = ft.deck_id`;

// Auteur affiché : @pseudo cliquable vers /u/:pseudo, sinon « Membre » non cliquable
// (compte sans pseudo — ex. avant backfill / sans display_name). escHtml systématique.
function authorByline(pseudo, cls) {
  const k = cls || 'tc-author';
  return pseudo
    ? `<a class="${k} forum-author" href="/u/${escHtml(pseudo)}">@${escHtml(pseudo)}</a>`
    : `<span class="${k}">Membre</span>`;
}

// Badge @forum_slug (violet) affiché SUR un sujet, cliquable vers la CARTE elle-même
// (page statut de la source / page publique du deck), pas vers la liste des sujets forum
// — on est déjà dans le contexte forum, ce badge sort vers la fiche. Le libellé reste le
// @forum_slug ; seule la destination change. L'id/token canonique vient des jointures.
function slugBadge(t) {
  if (t.source_id) {
    const slug = t.source_slug || t.source_id;
    return `<a class="forum-slug-badge" href="/source/${escHtml(t.source_id)}/statut">@${escHtml(slug)}</a>`;
  }
  if (t.deck_id) {
    const slug = t.deck_slug || t.deck_id;
    // Deck perso public (propriétaire + token) → page /deck/:token ; deck officiel → /collection/:id.
    const href = (t.deck_owner && t.deck_token)
      ? `/deck/${escHtml(t.deck_token)}`
      : `/collection/${escHtml(t.deck_id)}`;
    return `<a class="forum-slug-badge" href="${href}">@${escHtml(slug)}</a>`;
  }
  return '';
}

// Carte de sujet (composant central) — objet .card cliquable.
function topicCard(t) {
  const catLabel = CATEGORIES[t.category] || t.category;
  const n = t.reply_count;
  const lock = t.locked ? `<span class="forum-lock" title="Sujet verrouillé" aria-label="Sujet verrouillé">${LOCK_SVG}</span>` : '';
  // <article> (pas <a>) : le titre et le badge @slug sont des liens FRÈRES → aucune
  // ancre imbriquée (HTML invalide). La carte reste visuellement un bloc cliquable
  // via le lien-titre en pleine largeur (::after étendu en CSS).
  return `<article class="card topic-card forum-in">
    <a class="topic-card-title" href="/forum/t/${escHtml(t.slug)}">${escHtml(t.title)}</a>${lock}
    <div class="topic-card-meta">
      <a class="forum-tag" href="/forum/c/${escHtml(t.category)}">${escHtml(catLabel)}</a>
      ${slugBadge(t)}
      ${authorByline(t.author_pseudo)}
      <span class="tc-dot">·</span>
      <span class="tc-time">${escHtml(relativeTime(t.last_reply_at))}</span>
      <span class="tc-replies">${REPLY_SVG}${n}</span>
    </div>
  </article>`;
}

function topicList(rows, emptyMsg) {
  return rows.length
    ? `<div class="forum-list">${rows.map(topicCard).join('')}</div>`
    : `<p class="forum-empty">${escHtml(emptyMsg)}</p>`;
}

// CTA « Créer un sujet » (style bouton principal du site, .empty-btn) + contexte optionnel.
function createBtn(query) {
  const qs = query ? ('?' + query) : '';
  return `<a class="empty-btn forum-create-btn" href="/forum/nouveau${qs}">＋ Créer un sujet</a>`;
}

function breadcrumb(parts) {
  return parts.map((p, i) => {
    const last = i === parts.length - 1;
    return last || !p.href
      ? `<span aria-current="page">${escHtml(p.label)}</span>`
      : `<a href="${escHtml(p.href)}">${escHtml(p.label)}</a> <span class="bc-sep">›</span> `;
  }).join('');
}

function html404(res, msg) {
  return res.status(404).type('html').send(forumShell('Introuvable · Forum',
    `<h1 class="forum-title">Introuvable</h1>
     <p class="forum-empty">${escHtml(msg || 'Cette page n\'existe pas.')}</p>
     <p><a class="empty-btn" href="/forum">← Retour au forum</a></p>`,
    { noindex: true, breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: 'Introuvable' }]) }));
}

/* ================================================================== */
/* LECTURES PUBLIQUES (HTML)                                           */
/* ================================================================== */

// Accueil : catégories en cartes + derniers sujets actifs en cartes.
router.get('/forum', async (req, res) => {
  try {
    const counts = await pool.query(
      `SELECT category, COUNT(*)::int AS n FROM forum_topics WHERE hidden = false GROUP BY category`);
    const countMap = {};
    counts.rows.forEach((r) => { countMap[r.category] = r.n; });

    const recent = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false ORDER BY ft.last_reply_at DESC LIMIT $1`, [TOPICS_PER_PAGE]);

    const catCards = Object.keys(CATEGORIES).map((slug) => {
      const meta = CAT_META[slug] || { emoji: '•', desc: '' };
      const n = countMap[slug] || 0;
      return `<a class="card forum-cat-card forum-in" href="/forum/c/${slug}">
        <div class="fcc-emoji" aria-hidden="true">${meta.emoji}</div>
        <div class="fcc-body">
          <div class="fcc-name">${escHtml(CATEGORIES[slug])}</div>
          <div class="fcc-desc">${escHtml(meta.desc)}</div>
        </div>
        <div class="fcc-count">${n} sujet${n > 1 ? 's' : ''}</div>
      </a>`;
    }).join('');

    res.type('html').send(forumShell('Forum · La Bonne Alerte',
      `<div class="forum-head">
         <h1 class="forum-title">Le <span class="hl">forum</span></h1>
         ${createBtn('')}
       </div>
       <p class="forum-intro">Un coin pour échanger, proposer, s'entraider. Bienvenue.</p>
       <div class="forum-cats-grid">${catCards}</div>
       <h2 class="forum-h2">Sujets récents</h2>
       ${topicList(recent.rows, 'Aucun sujet pour le moment — lancez le premier !')}`,
      { breadcrumb: breadcrumb([{ label: 'Forum' }]) }));
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
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.category = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2 OFFSET $3`,
      [cat, TOPICS_PER_PAGE, (page_ - 1) * TOPICS_PER_PAGE]);
    const meta = CAT_META[cat] || { desc: '' };
    const pager = pagerHTML(`/forum/c/${cat}`, page_, rows.length);
    res.type('html').send(forumShell(`${CATEGORIES[cat]} · Forum`,
      `<div class="forum-head">
         <h1 class="forum-title">${escHtml(CATEGORIES[cat])}</h1>
         ${createBtn('cat=' + encodeURIComponent(cat))}
       </div>
       <p class="forum-intro">${escHtml(meta.desc || '')}</p>
       ${topicList(rows, 'Aucun sujet dans cette catégorie — soyez le premier.')}
       ${pager}`,
      { breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: CATEGORIES[cat] }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/c :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujets tagués à une source (cible du lien carte→forum).
router.get('/forum/source/:slug', async (req, res) => {
  const sid = req.params.slug;
  try {
    const canonicalId = await resolveSourceId(sid);
    const meta = await pool.query('SELECT name, forum_slug FROM sources WHERE id = $1', [canonicalId]);
    const name = meta.rows.length ? meta.rows[0].name : sid;
    const slug = (meta.rows.length && meta.rows[0].forum_slug) || sid;
    const { rows } = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.source_id = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2`, [canonicalId, TOPICS_PER_PAGE]);
    res.type('html').send(forumShell(`Discussions · ${name} · Forum`,
      `<div class="forum-head">
         <h1 class="forum-title">${escHtml(name)}</h1>
         ${createBtn('source=' + encodeURIComponent(slug))}
       </div>
       <p class="forum-intro">Discussions liées à <a class="forum-slug-badge" href="/source/${escHtml(canonicalId)}/statut">@${escHtml(slug)}</a></p>
       ${topicList(rows, 'Aucune discussion sur cette source pour le moment — ouvrez la première.')}`,
      { breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: name }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/source :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujets tagués à un DECK (miroir ; espace de noms séparé).
router.get('/forum/deck/:slug', async (req, res) => {
  const did = req.params.slug;
  try {
    const canonicalId = await resolveDeckId(did);
    // owner_subscriber_id + share_token : même règle de destination que slugBadge()
    // (deck perso public → /deck/:token, deck officiel → /collection/:id).
    const meta = await pool.query(
      'SELECT name, forum_slug, owner_subscriber_id, share_token FROM collections WHERE id = $1', [canonicalId]);
    const name = meta.rows.length ? meta.rows[0].name : did;
    const slug = (meta.rows.length && meta.rows[0].forum_slug) || did;
    const deckHref = (meta.rows.length && meta.rows[0].owner_subscriber_id && meta.rows[0].share_token)
      ? `/deck/${escHtml(meta.rows[0].share_token)}`
      : `/collection/${escHtml(canonicalId)}`;
    const { rows } = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.deck_id = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2`, [canonicalId, TOPICS_PER_PAGE]);
    res.type('html').send(forumShell(`Discussions · ${name} · Forum`,
      `<div class="forum-head">
         <h1 class="forum-title">${escHtml(name)}</h1>
         ${createBtn('deck=' + encodeURIComponent(slug))}
       </div>
       <p class="forum-intro">Discussions liées au deck <a class="forum-slug-badge" href="${deckHref}">@${escHtml(slug)}</a></p>
       ${topicList(rows, 'Aucune discussion sur ce deck pour le moment — ouvrez la première.')}`,
      { breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: name }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/deck :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Pagination simple (préc./suiv.) — n = nb de lignes de la page courante.
function pagerHTML(base, page_, n) {
  if (page_ <= 1 && n < TOPICS_PER_PAGE) return '';
  const prev = page_ > 1
    ? `<a class="forum-pager-btn" href="${base}?page=${page_ - 1}">← Précédents</a>` : '';
  const next = n >= TOPICS_PER_PAGE
    ? `<a class="forum-pager-btn" href="${base}?page=${page_ + 1}">Suivants →</a>` : '';
  return (prev || next) ? `<div class="forum-pager">${prev}<span class="forum-pager-page">Page ${page_}</span>${next}</div>` : '';
}

// Sujet + messages paginés (404 si masqué). Messages masqués filtrés.
router.get('/forum/t/:slug', async (req, res) => {
  const slug = req.params.slug;
  const page_ = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const t = await pool.query(
      `SELECT ft.id, ft.title, ft.category, ft.locked, ft.hidden,
              ft.source_id, ft.deck_id,
              s.forum_slug AS source_slug, c.forum_slug AS deck_slug,
              c.share_token AS deck_token, c.owner_subscriber_id AS deck_owner,
              COALESCE(au.display_name, 'Membre') AS author, au.pseudo AS author_pseudo, ft.created_at
         FROM forum_topics ft
         JOIN subscribers au ON au.id = ft.author_subscriber_id
         LEFT JOIN sources s ON s.id = ft.source_id
         LEFT JOIN collections c ON c.id = ft.deck_id
        WHERE ft.slug = $1`, [slug]);
    if (!t.rows.length || t.rows[0].hidden) return html404(res, 'Sujet introuvable.');
    const topic = t.rows[0];
    const p = await pool.query(
      `SELECT fp.id, fp.body, fp.created_at,
              COALESCE(s.display_name, 'Membre') AS author, s.pseudo AS author_pseudo
         FROM forum_posts fp JOIN subscribers s ON s.id = fp.author_subscriber_id
        WHERE fp.topic_id = $1 AND fp.hidden = false
        ORDER BY fp.created_at ASC LIMIT $2 OFFSET $3`,
      [topic.id, POSTS_PER_PAGE, (page_ - 1) * POSTS_PER_PAGE]);

    const posts = p.rows.map((post, i) => {
      const cls = (page_ === 1 && i === 0) ? 'card post-card post-card-op forum-in' : 'card post-card forum-in';
      return `<article class="${cls}">
        <div class="post-meta">
          ${authorByline(post.author_pseudo, 'post-author')}
          <span class="tc-dot">·</span>
          <span class="post-time">${escHtml(relativeTime(post.created_at))}</span>
          <button type="button" class="forum-report" data-post-id="${post.id}" title="Signaler ce message" aria-label="Signaler ce message">${FLAG_SVG}</button>
        </div>
        <div class="post-body">${bodyToHtml(post.body)}</div>
      </article>`;
    }).join('') || '<p class="forum-empty">Aucun message.</p>';

    const catLabel = CATEGORIES[topic.category] || topic.category;
    const replyZone = topic.locked
      ? `<div class="forum-locked-banner">${LOCK_SVG} Ce sujet est verrouillé : les réponses sont closes.</div>`
      : `<form id="forum-reply-form" class="forum-form" data-topic-id="${topic.id}">
           <label class="forum-label" for="reply-body">Votre réponse</label>
           <textarea id="reply-body" class="forum-textarea" maxlength="5000" required placeholder="Écrivez votre réponse…"></textarea>
           <div class="forum-form-row">
             <span class="forum-counter" data-for="reply-body">0 / 5000</span>
             <button type="submit" class="empty-btn">Répondre</button>
           </div>
           <p class="forum-form-msg" role="alert" hidden></p>
         </form>
         <div class="forum-login-invite" hidden>
           <p>Connectez-vous pour répondre à ce sujet.</p>
           <a class="empty-btn" href="/connexion">Se connecter</a>
         </div>`;

    res.type('html').send(forumShell(`${topic.title} · Forum`,
      `<article class="card topic-op-card">
         <h1 class="forum-title forum-title-topic">${escHtml(topic.title)}</h1>
         <div class="topic-card-meta">
           <a class="forum-tag" href="/forum/c/${escHtml(topic.category)}">${escHtml(catLabel)}</a>
           ${slugBadge(topic)}
           ${authorByline(topic.author_pseudo)}
           <span class="tc-dot">·</span>
           <span class="tc-time">${escHtml(relativeTime(topic.created_at))}</span>
           ${topic.locked ? `<span class="forum-lock">${LOCK_SVG} verrouillé</span>` : ''}
         </div>
       </article>
       <div class="forum-posts">${posts}</div>
       <section class="forum-reply">${replyZone}</section>`,
      { breadcrumb: breadcrumb([
          { label: 'Forum', href: '/forum' },
          { label: catLabel, href: '/forum/c/' + topic.category },
          { label: topic.title }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/t :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Page de création d'un sujet (server-rendu). Le tag source/deck est peuplé
// côté client via /api/forum/taggables (voir /js/forum.js). Pré-remplissage
// possible via ?cat= / ?source= / ?deck= (le client résout le slug).
router.get('/forum/nouveau', (req, res) => {
  const preCat = isCategory(req.query.cat) ? req.query.cat : '';
  const preSource = typeof req.query.source === 'string' ? req.query.source : '';
  const preDeck = typeof req.query.deck === 'string' ? req.query.deck : '';
  const catOptions = Object.keys(CATEGORIES).map((slug) =>
    `<option value="${slug}"${slug === preCat ? ' selected' : ''}>${escHtml(CATEGORIES[slug])}</option>`).join('');
  res.type('html').send(forumShell('Nouveau sujet · Forum',
    `<h1 class="forum-title">Nouveau <span class="hl">sujet</span></h1>
     <form id="forum-create-form" class="forum-form forum-create"
           data-pre-source="${escHtml(preSource)}" data-pre-deck="${escHtml(preDeck)}">
       <label class="forum-label" for="new-cat">Catégorie</label>
       <select id="new-cat" class="forum-select" required>
         <option value="" disabled${preCat ? '' : ' selected'}>Choisir une catégorie…</option>
         ${catOptions}
       </select>

       <label class="forum-label" for="new-title">Titre</label>
       <input id="new-title" class="forum-input" type="text" maxlength="140" required
              placeholder="Un titre clair et concis">
       <span class="forum-counter" data-for="new-title">0 / 140</span>

       <label class="forum-label" for="new-tag">Lier à une source ou un deck <span class="forum-optional">(optionnel)</span></label>
       <select id="new-tag" class="forum-select">
         <option value="">— Aucun —</option>
       </select>

       <label class="forum-label" for="new-body">Message</label>
       <textarea id="new-body" class="forum-textarea" maxlength="5000" required
                 placeholder="Développez votre sujet…"></textarea>
       <div class="forum-form-row">
         <span class="forum-counter" data-for="new-body">0 / 5000</span>
         <button type="submit" class="empty-btn">Publier le sujet</button>
       </div>
       <p class="forum-form-msg" role="alert" hidden></p>
     </form>
     <div class="forum-login-invite" hidden>
       <p>Il faut un compte pour créer un sujet. C'est gratuit et sans mot de passe.</p>
       <a class="empty-btn" href="/connexion">Se connecter</a>
     </div>`,
    { noindex: true, breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: 'Nouveau sujet' }]) }));
});

// Liste des cibles taguables (sources activées + decks officiels/publics) pour
// le <select> du formulaire de création. Lecture seule, léger.
router.get('/api/forum/taggables', async (req, res) => {
  try {
    const s = await pool.query(
      `SELECT id, name, forum_slug FROM sources WHERE enabled = true ORDER BY name ASC`);
    const d = await pool.query(
      `SELECT id, name, forum_slug FROM collections
        WHERE (visibility = 'official' AND owner_subscriber_id IS NULL)
           OR (visibility = 'public'   AND owner_subscriber_id IS NOT NULL)
        ORDER BY name ASC`);
    res.json({
      sources: s.rows.map((r) => ({ id: r.id, name: r.name, forum_slug: r.forum_slug })),
      decks: d.rows.map((r) => ({ id: r.id, name: r.name, forum_slug: r.forum_slug })),
    });
  } catch (err) {
    console.error('[forum] GET /api/forum/taggables :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

// Page profil publique /u/:pseudo — AGRÉGATION de contenu DÉJÀ public uniquement :
// decks publics + sujets de forum. JAMAIS email / abonnements / préférences / points /
// rang / tokens. Résolution STRICTE par pseudo (aucun repli par id interne). noindex.
// Les decks sont rendus en VRAIES tuiles-deck (LBADeckStack, identiques au kiosque) côté
// client via /js/profile-decks.js, qui appelle GET /api/forum/u/:pseudo/decks + /api/sources.
router.get('/u/:pseudo', async (req, res) => {
  const pseudo = req.params.pseudo;
  try {
    const u = await pool.query(
      'SELECT id, display_name, pseudo FROM subscribers WHERE pseudo = $1', [pseudo]);
    if (!u.rows.length) return html404(res, 'Ce membre n\'existe pas (ou plus).');
    const member = u.rows[0];
    const name = member.display_name || 'Membre';

    // Sujets de forum (non masqués) de ce membre, rendus en topicCard existants.
    const topics = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.author_subscriber_id = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2`, [member.id, TOPICS_PER_PAGE]);
    const hasTopics = topics.rows.length > 0;

    // Section decks : coquille masquée au rendu, révélée + peuplée par profile-decks.js si
    // le membre a au moins un deck public. Grille RÉUTILISÉE telle quelle de /favoris
    // (`<div class="grid" id="fav-grid">` → mêmes tuiles, même responsive). Bouton
    // `.more-btn` (pattern du kiosque, masqué via style inline) pour révéler au-delà de la
    // 1re ligne (4 decks). Le message « aucun contenu » (rendu seulement si aucun sujet)
    // est masqué côté client dès que des decks apparaissent.
    const decksSection = `<section id="profile-decks" data-pseudo="${escHtml(member.pseudo)}" hidden>
        <h2 class="forum-h2">Ses decks</h2>
        <div class="grid" id="fav-grid"></div>
        <button type="button" class="more-btn profile-decks-more" style="display:none">Afficher plus de decks</button>
      </section>`;
    const topicsSection = hasTopics
      ? `<h2 class="forum-h2">Ses sujets sur le forum</h2>${topicList(topics.rows, '')}` : '';
    const emptyState = hasTopics ? ''
      : '<p class="forum-empty" id="profile-empty">Ce membre n\'a pas encore de contenu public.</p>';

    // Pas de fil d'ariane sur le profil (contrairement aux autres pages forum).
    res.type('html').send(forumShell(`@${member.pseudo} · La Bonne Alerte`,
      `<h1 class="forum-title">${escHtml(name)}</h1>
       <p class="forum-intro"><span class="forum-slug-badge">@${escHtml(member.pseudo)}</span></p>
       ${decksSection}
       ${topicsSection}
       ${emptyState}`,
      { noindex: true, desc: `Profil public de @${member.pseudo} sur La Bonne Alerte.`,
        scripts: ['/js/cards.js', '/js/deck-motifs.js', '/js/deck-stack.js', '/js/profile-decks.js'] }));
  } catch (err) {
    console.error('[forum] GET /u/:pseudo :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Decks PUBLICS d'un membre (résolu STRICTEMENT par pseudo), même forme que /api/collections
// pour un rendu client identique au kiosque (LBADeckStack). AUCUN champ privé (pas d'email, de
// points, de rang, de owner_subscriber_id, ni de badge Top20). Conditions de visibilité
// alignées sur le kiosque : perso + public + token de partage + au moins une carte activée.
router.get('/api/forum/u/:pseudo/decks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.emoji, c.tint, c.categories, c.forum_slug,
              c.share_token,
              '/deck/' || c.share_token AS href,
              subr.display_name AS author, subr.pseudo AS author_pseudo,
              (SELECT asset_ref FROM skins WHERE id = c.equipped_skin_id) AS deck_skin,
              COUNT(s.id)::int AS card_count,
              COALESCE(SUM(s.likes_count), 0)::int AS total_likes,
              (SELECT COALESCE(json_agg(p.id), '[]'::json) FROM (
                 SELECT s3.id FROM collection_items ci3
                   JOIN sources s3 ON s3.id = ci3.source_id AND s3.enabled = true
                  WHERE ci3.collection_id = c.id
                  ORDER BY ci3.position DESC LIMIT 3) p) AS preview
         FROM collections c
         JOIN subscribers subr ON subr.id = c.owner_subscriber_id
         LEFT JOIN collection_items ci ON ci.collection_id = c.id
         LEFT JOIN sources s ON s.id = ci.source_id AND s.enabled = true
        WHERE subr.pseudo = $1 AND c.visibility = 'public'
          AND c.owner_subscriber_id IS NOT NULL AND c.share_token IS NOT NULL
        GROUP BY c.id, subr.display_name, subr.pseudo
        HAVING COUNT(s.id) > 0
        ORDER BY c.created_at DESC LIMIT 60`,
      [req.params.pseudo]);
    res.json({ decks: rows });
  } catch (err) {
    console.error('[forum] GET /api/forum/u/:pseudo/decks :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
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

// Compteur JSON pour un DECK (miroir de la route source).
router.get('/api/forum/deck/:slug/count', async (req, res) => {
  try {
    const canonicalId = await resolveDeckId(req.params.slug); // forum_slug prioritaire, repli id
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM forum_topics WHERE hidden = false AND deck_id = $1`,
      [canonicalId]);
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[forum] GET deck count :', err.message);
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

  // Cible optionnelle : source_id OU deck_id, jamais les deux (miroir du CHECK SQL).
  let sourceId = (req.body && req.body.source_id) || null;
  let deckId = (req.body && req.body.deck_id) || null;
  if (sourceId != null && deckId != null) {
    return res.status(400).json({ error: 'Un sujet cible au plus une source OU un deck, pas les deux.' });
  }
  if (sourceId != null) {
    sourceId = String(sourceId);
    const s = await pool.query('SELECT 1 FROM sources WHERE id = $1', [sourceId]);
    if (!s.rows.length) return res.status(400).json({ error: 'Source inconnue' });
  }
  if (deckId != null) {
    deckId = String(deckId);
    const d = await pool.query('SELECT 1 FROM collections WHERE id = $1', [deckId]);
    if (!d.rows.length) return res.status(400).json({ error: 'Deck inconnu' });
  }

  const slug = slugify(title.value);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(
      `INSERT INTO forum_topics (category, title, slug, author_subscriber_id, source_id, deck_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, slug`,
      [category, title.value, slug, auth.id, sourceId, deckId]);
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
