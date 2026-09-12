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
const { footerHtml } = require('../pages');

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
// `mentions` (optionnel) = Map slug → { href, kind } résolue EN LOT pour la page
// (cf. resolveMentions) : la substitution @slug → lien se fait APRÈS l'échappement,
// donc sur un texte où <, > et " n'existent plus. Sans map : rendu strictement
// identique à avant (les mentions restent du texte brut).
function bodyToHtml(s, mentions) {
  return linkifyMentions(escHtml(s), mentions).replace(/\n/g, '<br>');
}

// ── Mentions @slug (14/08/2026) ──────────────────────────────────────────────
// STOCKAGE : le corps garde le TEXTE BRUT « @slug ». Les deux identifiants visés
// (sources/collections.forum_slug, subscribers.pseudo) sont STABLES par construction
// (posés une fois, jamais régénérés au renommage) → résoudre au rendu ne peut pas
// « casser » avec le temps, et un objet supprimé retombe en texte, jamais en lien mort.
// SÉCURITÉ : la regex n'accepte QUE [a-z0-9] (le jeu exact produit par slugBase), et
// le href est construit à partir d'une valeur relue EN BASE — jamais du texte de
// l'utilisateur. Un « @nimportequoi » sans correspondance reste du texte.
const MENTION_RE = /(^|[\s(])@([a-z0-9]{1,64})\b/g;

// Slugs mentionnés dans un lot de corps (déduplication incluse).
function collectMentions(bodies) {
  const set = new Set();
  for (const b of bodies) {
    const s = String(b || '').toLowerCase();
    let m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(s)) !== null) set.add(m[2]);
  }
  return [...set];
}

// UNE requête par table pour TOUTE la page (jamais une par mention). Ordre de
// résolution PSEUDO → SOURCE → DECK (décision Hugo 14/08 ; 0 collision constatée
// entre les trois espaces de noms, le premier trouvé gagne).
async function resolveMentions(bodies) {
  const slugs = collectMentions(bodies);
  const map = new Map();
  if (!slugs.length) return map;
  const [u, s] = await Promise.all([
    pool.query('SELECT pseudo AS slug FROM subscribers WHERE pseudo = ANY($1)', [slugs]),
    pool.query('SELECT forum_slug AS slug, id FROM sources WHERE forum_slug = ANY($1) AND enabled = true', [slugs]),
  ]);
  // Decks : ARCHIVÉS (fil #9) — un @slug de deck n'est plus résolu, il reste du texte brut.
  // Le premier posé gagne : on remplit dans l'ordre inverse de priorité puis on écrase.
  s.rows.forEach((r) => map.set(r.slug, { href: `/source/${r.id}/statut` }));
  u.rows.forEach((r) => map.set(r.slug, { href: `/u/${r.slug}` }));
  return map;
}

// Substitution sur du HTML DÉJÀ ÉCHAPPÉ. `href` vient de resolveMentions (valeur de
// base), le libellé est le slug lui-même (déjà contraint à [a-z0-9] par la regex).
function linkifyMentions(escaped, mentions) {
  if (!mentions || !mentions.size) return escaped;
  return String(escaped).replace(MENTION_RE, (whole, pre, slug) => {
    const hit = mentions.get(slug.toLowerCase());
    if (!hit) return whole;                       // inconnu → texte brut, jamais d'erreur
    return `${pre}<a class="forum-mention" href="${escHtml(hit.href)}">@${slug}</a>`;
  });
}

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

// Partage social des pages de forum. Rendu SERVEUR, jamais par script : les crawlers
// sociaux n'executent pas le JavaScript. og:image en URL ABSOLUE (une relative est
// ignoree par la plupart d'entre eux).
// REGLE : rien de tout ca sur une page noindex. C'est ce qui protege /u/:pseudo, dont
// le profil ne doit exposer ni vignette ni description (il passe deja noindex:true) ;
// la 404 et le formulaire de creation en beneficient au passage.
const OG_IMAGE = SITE_URL + '/img/og-default.png';
function socialHead(title, desc, url) {
  return `<link rel="canonical" href="${escHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="La Bonne Alerte">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${escHtml(url)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="La Bonne Alerte — toutes vos alertes, en un clic.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">`;
}

// Layout commun (head + header injecté par header.js + footer + scripts partagés).
// opts.url : URL canonique absolue de la page. Sa presence (et l'absence de noindex)
// declenche le bloc de partage social ci-dessus.
function forumShell(title, inner, opts) {
  opts = opts || {};
  const bc = opts.breadcrumb ? `<nav class="forum-breadcrumb" aria-label="Fil d'Ariane">${opts.breadcrumb}</nav>` : '';
  const desc = opts.desc || 'Le forum de la communauté La Bonne Alerte.';
  const social = (!opts.noindex && opts.url)
    ? '\n' + socialHead(opts.ogTitle || title, desc, opts.url)
    : '';
  return `<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}${social}
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
${footerHtml()}
<script src="/js/session.js"></script>
<script src="/js/categories.js"></script>
<script src="/js/theme.js"></script>
<script src="/js/header.js"></script>
<!-- combo.js AVANT forum.js : base ARIA partagée (combobox de tag + mentions @slug). -->
<script src="/js/combo.js"></script>
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
  // Decks : ARCHIVÉS (fil #9, 12/09/2026) — un sujet tagué à un deck n'affiche plus de badge.
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
      { url: SITE_URL + '/forum',
        desc: 'Le forum de la communaute La Bonne Alerte : entraide, propositions de sources et suggestions.',
        breadcrumb: breadcrumb([{ label: 'Forum' }]) }));
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
      { url: SITE_URL + '/forum/c/' + encodeURIComponent(cat),
        desc: meta.desc || ('Les sujets de la categorie ' + CATEGORIES[cat] + ' sur le forum La Bonne Alerte.'),
        breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: CATEGORIES[cat] }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/c :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Sujets tagués à une source (cible du lien carte→forum).
router.get('/forum/source/:slug', async (req, res) => {
  const sid = req.params.slug;
  // Pagination : MÊME motif que /forum/c/:category (page_ + LIMIT/OFFSET + pagerHTML).
  // Sans elle, le LIMIT 30 tronquait la liste SANS aucun moyen d'aller plus loin.
  const page_ = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const canonicalId = await resolveSourceId(sid);
    const meta = await pool.query('SELECT name, forum_slug FROM sources WHERE id = $1', [canonicalId]);
    const name = meta.rows.length ? meta.rows[0].name : sid;
    const slug = (meta.rows.length && meta.rows[0].forum_slug) || sid;
    // CANONICAL : forme INVERSE du correctif des sujets (/forum/t/:slug). Pour un
    // sujet, req.params.slug ETAIT la valeur canonique. Ici resolveSourceId() accepte
    // DEUX entrees (forum_slug OU id) : l'URL demandee n'est donc pas forcement la
    // canonique, et la reprendre telle quelle donnait deux canonical differents pour
    // la meme page selon qu'on arrivait par l'id ou par le slug. On pointe vers le
    // forum_slug de la ligne RESOLUE ; a defaut, vers l'id RESOLU — jamais vers le
    // parametre recu. Le pager, lui, garde l'URL courante (voir plus haut).
    const canonSlug = (meta.rows.length && meta.rows[0].forum_slug) || canonicalId;
    const { rows } = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.source_id = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2 OFFSET $3`,
      [canonicalId, TOPICS_PER_PAGE, (page_ - 1) * TOPICS_PER_PAGE]);
    // base = l'URL COURANTE (le paramètre reçu, pas l'id canonique) : ?page=2 doit
    // rester sur la même page, y compris quand on est arrivé par le slug public.
    const pager = pagerHTML(`/forum/source/${encodeURIComponent(sid)}`, page_, rows.length);
    res.type('html').send(forumShell(`Discussions · ${name} · Forum`,
      `<div class="forum-head">
         <h1 class="forum-title">${escHtml(name)}</h1>
         ${createBtn('source=' + encodeURIComponent(slug))}
       </div>
       <p class="forum-intro">Discussions liées à <a class="forum-slug-badge" href="/source/${escHtml(canonicalId)}/statut">@${escHtml(slug)}</a></p>
       ${topicList(rows, 'Aucune discussion sur cette source pour le moment — ouvrez la première.')}
       ${pager}`,
      { url: SITE_URL + '/forum/source/' + encodeURIComponent(canonSlug),
        desc: 'Les discussions liees a la source ' + name + ' sur La Bonne Alerte.',
        breadcrumb: breadcrumb([{ label: 'Forum', href: '/forum' }, { label: name }]) }));
  } catch (err) {
    console.error('[forum] GET /forum/source :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Route /forum/deck/:slug : ARCHIVÉE (fil #9, 12/09/2026) — affichage deck retiré du forum.
// La logique interne (forum_topics.deck_id, resolveDeckId, contrainte « une seule cible »)
// reste en place pour ne pas casser les sujets existants ; seules les SURFACES disparaissent.

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

    // Mentions : UNE résolution pour toute la page (3 requêtes au total, quel que soit
    // le nombre de messages et de @slug qu'ils contiennent).
    const mentions = await resolveMentions(p.rows.map((r) => r.body));

    const posts = p.rows.map((post, i) => {
      const cls = (page_ === 1 && i === 0) ? 'card post-card post-card-op forum-in' : 'card post-card forum-in';
      return `<article class="${cls}">
        <div class="post-meta">
          ${authorByline(post.author_pseudo, 'post-author')}
          <span class="tc-dot">·</span>
          <span class="post-time">${escHtml(relativeTime(post.created_at))}</span>
          <button type="button" class="forum-report" data-post-id="${post.id}" title="Signaler ce message" aria-label="Signaler ce message">${FLAG_SVG}</button>
        </div>
        <div class="post-body">${bodyToHtml(post.body, mentions)}</div>
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
      // slug = req.params.slug : le sujet est trouve par egalite EXACTE sur ft.slug,
      // c'est donc deja la valeur canonique. Ne pas utiliser topic.slug : le SELECT
      // ci-dessus ne ramene pas ft.slug (canonical rendu en /forum/t/undefined).
      { url: SITE_URL + '/forum/t/' + encodeURIComponent(slug),
        ogTitle: topic.title,
        desc: 'Un sujet du forum La Bonne Alerte, dans la categorie ' + catLabel + '.',
        breadcrumb: breadcrumb([
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

       <!-- L'attribut for pointe le champ VISIBLE (#new-tag-search) : #new-tag est devenu
            un input caché, qui ne peut pas recevoir le focus d'un clic sur le libellé.
            (Rappel : on est dans un template literal — aucun accent grave ici.) -->
       <label class="forum-label" for="new-tag-search">Lier à une source ou un deck <span class="forum-optional">(optionnel)</span></label>
       <!-- COMBOBOX FILTRABLE (~300 cibles : un <select> natif était inutilisable au
            clavier). Filtrage 100 % CLIENT sur /api/forum/taggables, chargé une seule
            fois par /js/forum.js — aucune requête par frappe (contrairement au combobox
            dynamic-enum du kiosque, qui interroge le serveur à chaque saisie).
            Classes .tag-* VOLONTAIREMENT distinctes de .dyn-* : les handlers du kiosque
            sont délégués sur document et se déclencheraient sur ce formulaire.
            #new-tag reste un champ CACHÉ portant "source:<id>" / "deck:<id>" → le
            contrat du POST /forum/t est inchangé. -->
       <div class="tag-combo" id="new-tag-combo">
         <input id="new-tag-search" class="forum-input tag-search" type="text"
                role="combobox" aria-expanded="false" aria-controls="new-tag-listbox"
                aria-autocomplete="list" aria-haspopup="listbox"
                placeholder="Tapez pour filtrer… (facultatif)"
                autocomplete="off" autocapitalize="off" spellcheck="false">
         <input type="hidden" id="new-tag" value="">
         <ul class="tag-listbox" id="new-tag-listbox" role="listbox"
             aria-label="Sources et decks" hidden></ul>
         <div class="tag-status" role="status" aria-live="polite"></div>
       </div>

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
    // Decks : ARCHIVÉS (fil #9) — plus proposés comme cible de tag à la création de sujet.
    res.json({
      sources: s.rows.map((r) => ({ id: r.id, name: r.name, forum_slug: r.forum_slug })),
    });
  } catch (err) {
    console.error('[forum] GET /api/forum/taggables :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

// Cibles MENTIONNABLES (@slug dans un message) : membres + sources + decks.
// Forme alignée sur /api/forum/taggables, à un détail près : chaque entrée porte son
// `slug` (c'est lui qu'on écrit dans le texte), là où taggables sert un <select> dont
// la valeur est un id interne.
// ⚠️ PÉRIMÈTRE DES MEMBRES — décision Hugo 14/08 : SEULEMENT les pseudos DÉJÀ
// PUBLIQUEMENT VISIBLES (auteur d'un sujet ou d'un message non masqué, ou propriétaire
// d'un deck public). Renvoyer tous les comptes ferait de cette route un ANNUAIRE des
// inscrits, ce que le projet n'expose nulle part (même doctrine que /u/:pseudo et
// /le-point : on agrège du déjà-public, jamais on ne le crée). Aucun email, aucun id
// interne, aucun compteur privé ne sort d'ici.
router.get('/api/forum/mentionables', async (req, res) => {
  try {
    const [m, s] = await Promise.all([
      pool.query(
        `SELECT u.pseudo AS slug, COALESCE(u.display_name, u.pseudo) AS name
           FROM subscribers u
          WHERE u.pseudo IS NOT NULL AND (
            EXISTS (SELECT 1 FROM forum_topics t WHERE t.author_subscriber_id = u.id AND t.hidden = false)
            OR EXISTS (SELECT 1 FROM forum_posts fp WHERE fp.author_subscriber_id = u.id AND fp.hidden = false)
            OR EXISTS (SELECT 1 FROM collections c
                        WHERE c.owner_subscriber_id = u.id AND c.visibility = 'public'))
          ORDER BY u.pseudo ASC`),
      pool.query(
        `SELECT forum_slug AS slug, name FROM sources
          WHERE enabled = true AND forum_slug IS NOT NULL ORDER BY name ASC`),
    ]);
    // Decks : ARCHIVÉS (fil #9) — plus mentionnables (@slug deck retiré de l'autocomplétion).
    res.json({ members: m.rows, sources: s.rows });
  } catch (err) {
    console.error('[forum] GET /api/forum/mentionables :', err.message);
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
  const page_ = Math.max(1, parseInt(req.query.page, 10) || 1); // cf. /forum/c/:category
  try {
    const u = await pool.query(
      'SELECT id, display_name, pseudo FROM subscribers WHERE pseudo = $1', [pseudo]);
    if (!u.rows.length) return html404(res, 'Ce membre n\'existe pas (ou plus).');
    const member = u.rows[0];
    const name = member.display_name || 'Membre';

    // Sujets de forum (non masqués) de ce membre, rendus en topicCard existants.
    // Paginés comme /forum/c/:category : le LIMIT seul rendait le 31e sujet d'un
    // membre actif définitivement inatteignable (troncature silencieuse).
    const topics = await pool.query(
      `${TOPIC_SELECT} WHERE ft.hidden = false AND ft.author_subscriber_id = $1
        ORDER BY ft.last_reply_at DESC LIMIT $2 OFFSET $3`,
      [member.id, TOPICS_PER_PAGE, (page_ - 1) * TOPICS_PER_PAGE]);
    const hasTopics = topics.rows.length > 0;
    const pager = pagerHTML(`/u/${encodeURIComponent(pseudo)}`, page_, topics.rows.length);

    // Section decks : coquille masquée au rendu, révélée + peuplée par profile-decks.js si
    // le membre a au moins un deck public. Grille RÉUTILISÉE telle quelle de /favoris
    // (`<div class="grid" id="fav-grid">` → mêmes tuiles, même responsive). Bouton
    // `.more-btn` (pattern du kiosque, masqué via style inline) pour révéler au-delà de la
    // 1re ligne (4 decks). Le message « aucun contenu » (rendu seulement si aucun sujet)
    // est masqué côté client dès que des decks apparaissent.
    // PAGE 1 SEULEMENT : la pagination ?page= ne porte que sur les SUJETS ; les decks ne
    // sont pas paginés (ils ont leur propre « Afficher plus »), les répéter à l'identique
    // en page 2 ferait croire à une seconde collection.
    const decksSection = ''; // « Ses decks » : ARCHIVÉ (fil #9, 12/09/2026) — section retirée du profil.
    const topicsSection = hasTopics
      ? `<h2 class="forum-h2">Ses sujets sur le forum</h2>${topicList(topics.rows, '')}` : '';
    // L'état « aucun contenu » ne vaut QUE pour la page 1 : au-delà, une page vide
    // signifie « fin de la liste », pas « membre sans contenu » — le pager (← Précédents)
    // reste alors le seul repère utile.
    const emptyState = (hasTopics || page_ > 1) ? ''
      : '<p class="forum-empty" id="profile-empty">Ce membre n\'a pas encore de contenu public.</p>';

    // Pas de fil d'ariane sur le profil (contrairement aux autres pages forum).
    res.type('html').send(forumShell(`@${member.pseudo} · La Bonne Alerte`,
      `<h1 class="forum-title">${escHtml(name)}</h1>
       <p class="forum-intro"><span class="forum-slug-badge">@${escHtml(member.pseudo)}</span></p>
       ${decksSection}
       ${topicsSection}
       ${emptyState}
       ${pager}`,
      { noindex: true, desc: `Profil public de @${member.pseudo} sur La Bonne Alerte.`,
        scripts: [] })); // scripts decks (deck-motifs/deck-stack/profile-decks) : ARCHIVÉS (fil #9)
  } catch (err) {
    console.error('[forum] GET /u/:pseudo :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Route /api/forum/u/:pseudo/decks : ARCHIVÉE (fil #9, 12/09/2026) — decks retirés du profil public.

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

// Route /api/forum/deck/:slug/count : ARCHIVÉE (fil #9, 12/09/2026) — decks retirés du forum.

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
// Liste des categories exposee pour le sitemap (source unique de verite).
module.exports.CATEGORIES = CATEGORIES;
