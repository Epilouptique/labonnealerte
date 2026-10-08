// Routes de l'application Android LaBonneAlerte (fil APP-01). Fichier ADDITIF :
// aucune route existante n'est modifiee. Monte sous /api dans server/index.js.
//
//   GET  /api/app/config          → version minimale, maintenance, cle VAPID, version des conditions (public)
//   POST /api/app/login/request   → envoie un code a 6 chiffres : connexion (+ lien magique) si
//                                   l'adresse est inscrite, creation de compte sinon (APP-04)
//   POST /api/app/login/verify    → echange email + code (+ conditions acceptees pour une
//                                   creation) contre une session (Bearer)
//   GET  /api/app/events          → evenements des alertes suivies depuis l'id N (Bearer)
//
// Le push de l'app passe par l'existant (/api/push/subscribe : UnifiedPush = Web Push).
// Contrat detaille : depot LabonnealerteApp, docs/contrat-api-app.md §10.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate, createSession } = require('../sessions');
const { sendAppLoginCode, sendAppSignupCode } = require('../mailer');
const { publicKey } = require('../webpush');
const { resolveLabel } = require('../params');
const { publicEventMessage } = require('../public-events');
const { fingerprint } = require('../token-hash');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reponse IDENTIQUE que l'adresse soit inscrite ou non (APP-04 : un code part dans les deux cas).
const NEUTRAL = { message: 'Un code à 6 chiffres vient d’être envoyé à cette adresse.' };

// Creation de compte (APP-04) : version du texte accepte (politique de confidentialite).
// A CHANGER a chaque modification du texte ; l'app affiche le lien et renvoie la version.
const APP_TERMS_VERSION = 'confidentialite-2026-10';
const APP_TERMS_URL = 'https://labonnealerte.fr/confidentialite';

// Version minimale de l'app (versionCode). Sans variable : 0 = aucune contrainte.
// Variables Railway OPTIONNELLES (a poser par Hugo seulement s'il le souhaite) :
//   APP_MIN_VERSION_CODE, APP_LATEST_VERSION_CODE, APP_MAINTENANCE=1, APP_MESSAGE
function intEnv(name) {
  const n = parseInt(process.env[name] || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

router.get('/app/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    min_version_code: intEnv('APP_MIN_VERSION_CODE'),
    latest_version_code: intEnv('APP_LATEST_VERSION_CODE'),
    maintenance: process.env.APP_MAINTENANCE === '1',
    message: process.env.APP_MESSAGE ? String(process.env.APP_MESSAGE).slice(0, 300) : null,
    vapid_public_key: publicKey() || null,
    terms_version: APP_TERMS_VERSION,
    terms_url: APP_TERMS_URL,
  });
});

/* ------------------------------------------------------------------ */
/* Code de connexion a 6 chiffres                                      */
/* ------------------------------------------------------------------ */
// Le code est lie au magic_token courant de l'abonne (meme duree : 30 min, usage unique).
// Il est garde EN MEMOIRE (empreinte seulement) : aucune table ni colonne ajoutee.
// Hypothese : une seule instance du serveur. Un redemarrage invalide les codes en cours
// (le lien de l'email reste valable) — l'utilisateur redemande un code.
//
// Anti force brute (revue de securite APP-01) :
//  - 5 essais par code, et le compteur NE repart PAS a zero si on redemande un code ;
//  - 10 echecs par heure et par email, puis blocage d'une heure (independant de l'IP) ;
//  - 3 envois par 15 min et par email (au-dela : reponse neutre, pas d'e-mail) ;
//  - limites par IP (rateIp : cf-connecting-ip si secret d'origine verifie, sinon req.ip).
const CODE_TTL_MS = 30 * 60_000;
const MAX_TRIES_PER_CODE = 5;
const MAX_FAILS_PER_EMAIL = 10;
const FAIL_WINDOW_MS = 60 * 60_000;
const MAX_SENDS_PER_EMAIL = 3;
const SEND_WINDOW_MS = 15 * 60_000;
const MAP_CAP = 50_000;

// PLAFOND GLOBAL des e-mails de code (connexion + creation, tous destinataires confondus).
// Borne le cout d'un abus reparti sur beaucoup d'adresses et d'IP, et protege le quota du
// fournisseur d'e-mails partage avec les alertes. Ne concerne QUE ce flux : les e-mails
// d'alertes des abonnes ne passent pas par ici et ne sont jamais bloques.
// Au plafond : meme reponse neutre (deja envoyee), aucun e-mail, aucun code cree, une ligne
// de journal par fenetre (sans adresse). Compteurs EN MEMOIRE : un redemarrage les remet a
// zero (les limites par adresse et par IP restent en place).
// Variables OPTIONNELLES : APP_CODE_MAX_PER_HOUR (defaut 30), APP_CODE_MAX_PER_DAY (defaut 150).
function capEnv(name, def) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
const GLOBAL_MAX_PER_HOUR = capEnv('APP_CODE_MAX_PER_HOUR', 30);
const GLOBAL_MAX_PER_DAY = capEnv('APP_CODE_MAX_PER_DAY', 150);
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
let globalSends = [];             // timestamps des envois (24 h glissantes)
const capLogged = { hour: 0, day: 0 }; // dernier journal par fenetre (une ligne par fenetre)

function globalSendOk() {
  const now = Date.now();
  globalSends = globalSends.filter((t) => now - t < DAY_MS);
  const lastHour = globalSends.filter((t) => now - t < HOUR_MS).length;
  const which = globalSends.length >= GLOBAL_MAX_PER_DAY ? 'day' : lastHour >= GLOBAL_MAX_PER_HOUR ? 'hour' : null;
  if (which) {
    const win = which === 'day' ? DAY_MS : HOUR_MS;
    if (now - capLogged[which] >= win) {
      capLogged[which] = now;
      console.warn(`[app-api] PLAFOND GLOBAL ATTEINT (${which === 'day' ? `${GLOBAL_MAX_PER_DAY}/24 h` : `${GLOBAL_MAX_PER_HOUR}/h`}) : e-mails de code suspendus, reponse neutre inchangee`);
    }
    return false;
  }
  globalSends.push(now);
  return true;
}

const codes = new Map();      // email -> { hash, token, exp, tries }
const failsByEmail = new Map(); // email -> [timestamps d'echec]
const sendsByEmail = new Map(); // email -> [timestamps d'envoi]
const ipHits = new Map();       // cle -> [timestamps]

function hashCode(email, code) {
  return crypto.createHash('sha256').update(`${email}:${code}`).digest();
}

function recent(map, key, windowMs) {
  const now = Date.now();
  return (map.get(key) || []).filter((t) => now - t < windowMs);
}

// Au-dela du plafond, on retire la cle la plus ancienne (ordre d'insertion de Map) :
// vider toute la table remettrait a zero les verrous par email (audit APP-02).
function capMap(map) {
  while (map.size >= MAP_CAP) map.delete(map.keys().next().value);
}

function push(map, key, windowMs) {
  if (!map.has(key)) capMap(map);
  const arr = recent(map, key, windowMs);
  arr.push(Date.now());
  map.set(key, arr);
  return arr.length;
}

function rateOk(key, max) {
  if (recent(ipHits, key, 60_000).length >= max) return false;
  push(ipHits, key, 60_000);
  return true;
}

// IP pour les limites de debit. On ne reprend PAS clientIp() (premier X-Forwarded-For
// public, falsifiable en acces direct a Railway) : cf-connecting-ip seulement si le
// secret d'origine est verifie, sinon req.ip (trust proxy 1 = adresse vue par Railway).
function rateIp(req) {
  const h = req.headers || {};
  const secret = process.env.ORIGIN_SECRET;
  if (secret && h['cf-connecting-ip'] && h['x-origin-secret'] === secret) return String(h['cf-connecting-ip']).trim();
  return req.ip || 'inconnue';
}

// Journaux sans donnee personnelle : jamais err.message (un refus SMTP peut citer l'adresse).
function errTag(err) {
  return (err && (err.code || err.name)) || 'erreur';
}

function normEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  for (const [m, w] of [[ipHits, 60_000], [failsByEmail, FAIL_WINDOW_MS], [sendsByEmail, SEND_WINDOW_MS]]) {
    for (const [k, v] of m) if (!v.some((t) => now - t < w)) m.delete(k);
  }
}, 5 * 60_000).unref();

router.post('/app/login/request', async (req, res) => {
  if (!rateOk(`req:${rateIp(req)}`, 5)) return res.status(429).json({ error: 'Trop de demandes, réessayez dans une minute.' });
  const normalized = normEmail((req.body || {}).email);
  // Reponse neutre AVANT tout acces a la base : meme duree pour un email inscrit ou non
  // (anti-enumeration par mesure du temps de reponse, audit APP-02).
  res.status(200).json(NEUTRAL);
  if (normalized && normalized.length <= 254 && EMAIL_RE.test(normalized) &&
      recent(sendsByEmail, normalized, SEND_WINDOW_MS).length < MAX_SENDS_PER_EMAIL &&
      globalSendOk()) {
    try {
      // Memes plafonds dans les deux cas (inscrit ou non) : le compteur d'envois est pousse
      // AVANT de savoir si l'adresse existe.
      push(sendsByEmail, normalized, SEND_WINDOW_MS);
      const { rows } = await pool.query(
        'SELECT id FROM subscribers WHERE email = $1 AND confirmed = true',
        [normalized]
      );
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const prev = codes.get(normalized);
      const tries = prev && prev.exp > Date.now() ? prev.tries : 0;
      if (!codes.has(normalized)) capMap(codes);
      if (rows.length > 0) {
        // CONNEXION. Meme mecanisme que POST /api/my-alerts/request (lien magique 30 min). On
        // stocke l'EMPREINTE du magic_token ; le BRUT reste en memoire (codes) et part par e-mail.
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
          `UPDATE subscribers
              SET magic_token = $1, magic_token_expires_at = NOW() + INTERVAL '30 minutes'
            WHERE id = $2`,
          [fingerprint(token), rows[0].id]
        );
        codes.set(normalized, { mode: 'login', hash: hashCode(normalized, code), token, exp: Date.now() + CODE_TTL_MS, tries });
        await sendAppLoginCode(normalized, token, code);
      } else {
        // CREATION (APP-04) : adresse inconnue ou jamais confirmee. AUCUNE ecriture en base ici :
        // le compte n'existe qu'apres le bon code ET l'acceptation des conditions (verify).
        codes.set(normalized, { mode: 'create', hash: hashCode(normalized, code), token: null, exp: Date.now() + CODE_TTL_MS, tries });
        await sendAppSignupCode(normalized, code);
      }
    } catch (err) {
      console.error('[app-api] Échec demande de code de connexion :', errTag(err));
    }
  }
});

router.post('/app/login/verify', async (req, res) => {
  if (!rateOk(`ver:${rateIp(req)}`, 10)) return res.status(429).json({ error: 'Trop d\'essais, réessayez dans une minute.' });
  const normalized = normEmail((req.body || {}).email);
  const code = (req.body || {}).code;
  const bad = () => res.status(400).json({ error: 'Code incorrect ou expiré' });
  if (!normalized || typeof code !== 'string' || !/^\d{6}$/.test(code)) return bad();
  if (recent(failsByEmail, normalized, FAIL_WINDOW_MS).length >= MAX_FAILS_PER_EMAIL) {
    return res.status(429).json({ error: 'Trop d\'essais pour cette adresse, réessayez dans une heure.' });
  }
  const entry = codes.get(normalized);
  if (!entry || entry.exp < Date.now()) {
    codes.delete(normalized);
    push(failsByEmail, normalized, FAIL_WINDOW_MS);
    return bad();
  }
  entry.tries += 1;
  const ok = crypto.timingSafeEqual(entry.hash, hashCode(normalized, code));
  if (!ok) {
    push(failsByEmail, normalized, FAIL_WINDOW_MS);
    if (entry.tries >= MAX_TRIES_PER_CODE) codes.delete(normalized);
    return bad();
  }
  if (entry.mode === 'create') return verifyCreate(req, res, normalized, entry);
  codes.delete(normalized);
  try {
    // authenticate() consomme le magic_token (usage unique) et cree une session.
    const auth = await authenticate(entry.token);
    if (!auth) return bad(); // lien deja utilise depuis l'email, ou expire
    failsByEmail.delete(normalized);
    return res.status(200).json({ token: auth.sessionToken, email: auth.email });
  } catch (err) {
    console.error('[app-api] Erreur POST /app/login/verify :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// Creation de compte (APP-04), appelee avec un code CORRECT d'une adresse inconnue :
//  - sans acceptation des conditions : 409 { needs_terms } et le code RESTE valable (l'app
//    affiche les conditions puis rappelle verify). Seul le detenteur du bon code (donc de la
//    boite mail) apprend ainsi que l'adresse n'a pas de compte ;
//  - avec accept_terms === true et la version courante : le code est consomme AVANT tout
//    await (usage unique, meme sous requetes concurrentes : Node traite ce bloc d'une traite),
//    puis UN SEUL INSERT ... ON CONFLICT cree le compte (ou confirme une ligne non confirmee
//    du site) et enregistre la date et la version acceptees. Session : createSession() tel quel.
async function verifyCreate(req, res, normalized, entry) {
  const body = req.body || {};
  if (body.accept_terms !== true) {
    return res.status(409).json({ needs_terms: true, terms_version: APP_TERMS_VERSION, terms_url: APP_TERMS_URL });
  }
  if (body.terms_version !== APP_TERMS_VERSION) {
    return res.status(409).json({ needs_terms: true, terms_version: APP_TERMS_VERSION, terms_url: APP_TERMS_URL });
  }
  if (codes.get(normalized) !== entry) return res.status(400).json({ error: 'Code incorrect ou expiré' });
  codes.delete(normalized);
  try {
    const token = crypto.randomBytes(32).toString('hex'); // jeton d'abonne (desinscription), comme auth.js
    const { rows } = await pool.query(
      `INSERT INTO subscribers (email, confirmed, token, terms_accepted_at, terms_version)
       VALUES ($1, true, $2, NOW(), $3)
       ON CONFLICT (email) DO UPDATE
         SET confirmed = true, terms_accepted_at = NOW(), terms_version = EXCLUDED.terms_version
       RETURNING id, email`,
      [normalized, token, APP_TERMS_VERSION]
    );
    const sessionToken = await createSession(rows[0].id);
    failsByEmail.delete(normalized);
    return res.status(200).json({ token: sessionToken, email: rows[0].email, created: true });
  } catch (err) {
    console.error('[app-api] Erreur creation de compte :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/app/events?since_id=N&limit=100                            */
/* ------------------------------------------------------------------ */
// Memes regles que GET /api/my-alerts/history (sources actives, instances suivies,
// message assaini), mais par id croissant pour la synchronisation de l'app
// (repli sans push et deduplication). Les evenements « failed » ne sont pas renvoyes :
// ils ne concernent pas l'abonne.
router.get('/app/events', async (req, res) => {
  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
    const sinceRaw = Math.min(parseInt(req.query.since_id || '0', 10), Number.MAX_SAFE_INTEGER);
    const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0;
    const limRaw = parseInt(req.query.limit || '100', 10);
    const limit = Math.min(Math.max(Number.isFinite(limRaw) ? limRaw : 100, 1), 200);

    // Premiere synchronisation (since_id=0) : seulement les 7 derniers jours.
    const { rows } = await pool.query(
      `SELECT ev.id, ev.event, ev.message, ev.created_at, ev.params,
              s.id AS source_id, s.name AS source_name, s.params_schema, s.categories
         FROM source_events ev
         JOIN sources s ON s.id = ev.source_id
        WHERE s.enabled = true
          AND ev.id > $2
          AND ev.event IN ('activated', 'deactivated')
          AND ($2 > 0 OR ev.created_at > NOW() - INTERVAL '7 days')
          AND EXISTS (SELECT 1 FROM subscriptions sub
                       WHERE sub.source_id = ev.source_id AND sub.subscriber_id = $1
                         AND (sub.params IS NOT DISTINCT FROM ev.params OR ev.params IS NULL))
        ORDER BY ev.id ASC
        LIMIT $3`,
      [auth.id, since, limit + 1]
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const events = page.map((r) => {
      const label = r.params ? resolveLabel(r.params_schema, r.params) : '';
      const qs = r.params && typeof r.params === 'object'
        ? '?' + new URLSearchParams(Object.entries(r.params).map(([k, v]) => [k, String(v)])).toString()
        : '';
      return {
        id: Number(r.id),
        source_id: r.source_id,
        source_name: r.source_name,
        event: r.event,
        message: publicEventMessage(r.event, r.message),
        label: label || null,
        categories: Array.isArray(r.categories) ? r.categories : [],
        created_at: r.created_at.toISOString(),
        url: `https://labonnealerte.fr/source/${encodeURIComponent(r.source_id)}/statut${qs === '?' ? '' : qs}`,
      };
    });
    const lastId = page.length ? Number(page[page.length - 1].id) : since;
    return res.status(200).json({ events, last_id: lastId, has_more: hasMore });
  } catch (err) {
    console.error('[app-api] Erreur GET /app/events :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* Forum en lecture (JSON) pour l'app — memes requetes et memes regles */
/* de visibilite que les pages HTML de server/routes/forum.js          */
/* (hidden = false), sans les champs « deck » (fonction archivee).     */
/* Les ecritures restent sur les routes existantes (/forum/t, reply…). */
/* ------------------------------------------------------------------ */
const { CATEGORIES: FORUM_CATEGORIES } = require('./forum');
const FORUM_TOPICS_PER_PAGE = 30;
const FORUM_POSTS_PER_PAGE = 20;

const FORUM_TOPIC_SELECT = `
  SELECT ft.id, ft.slug, ft.title, ft.category, ft.reply_count, ft.last_reply_at, ft.locked,
         ft.source_id, s.forum_slug AS source_slug, s.name AS source_name,
         COALESCE(au.display_name, 'Membre') AS author, au.pseudo AS author_pseudo
    FROM forum_topics ft
    JOIN subscribers au ON au.id = ft.author_subscriber_id
    LEFT JOIN sources s ON s.id = ft.source_id`;

function forumTopic(r) {
  return {
    id: Number(r.id), slug: r.slug, title: r.title, category: r.category,
    reply_count: r.reply_count || 0,
    last_reply_at: r.last_reply_at ? new Date(r.last_reply_at).toISOString() : null,
    locked: !!r.locked, source_id: r.source_id || null, source_name: r.source_name || null,
    author: r.author, author_pseudo: r.author_pseudo || null,
  };
}

function pageOf(q) {
  const n = parseInt(q, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}

router.get('/app/forum', async (req, res) => {
  try {
    const counts = await pool.query(
      'SELECT category, COUNT(*)::int AS n FROM forum_topics WHERE hidden = false GROUP BY category');
    const byCat = Object.fromEntries(counts.rows.map((r) => [r.category, r.n]));
    const recent = await pool.query(
      `${FORUM_TOPIC_SELECT} WHERE ft.hidden = false ORDER BY ft.last_reply_at DESC LIMIT $1`, [FORUM_TOPICS_PER_PAGE]);
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      categories: Object.keys(FORUM_CATEGORIES).map((slug) => ({ slug, label: FORUM_CATEGORIES[slug], count: byCat[slug] || 0 })),
      recent: recent.rows.map(forumTopic),
    });
  } catch (err) {
    console.error('[app-api] Erreur GET /app/forum :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// Liste paginee : ?category=… ou ?source=<id de source> ou ?author=<pseudo>.
router.get('/app/forum/topics', async (req, res) => {
  const page = pageOf(req.query.page);
  const { category, source, author } = req.query;
  let where = 'ft.hidden = false';
  const params = [];
  if (typeof category === 'string' && category) {
    if (!Object.prototype.hasOwnProperty.call(FORUM_CATEGORIES, category)) return res.status(400).json({ error: 'Catégorie inconnue' });
    params.push(category); where += ` AND ft.category = $${params.length}`;
  } else if (typeof source === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(source)) {
    params.push(source); where += ` AND ft.source_id = $${params.length}`;
  } else if (typeof author === 'string' && author && author.length <= 64) {
    params.push(author); where += ` AND au.pseudo = $${params.length}`;
  }
  try {
    params.push(FORUM_TOPICS_PER_PAGE + 1, (page - 1) * FORUM_TOPICS_PER_PAGE);
    const { rows } = await pool.query(
      `${FORUM_TOPIC_SELECT} WHERE ${where} ORDER BY ft.last_reply_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.set('Cache-Control', 'public, max-age=30');
    return res.status(200).json({ topics: rows.slice(0, FORUM_TOPICS_PER_PAGE).map(forumTopic), page, has_more: rows.length > FORUM_TOPICS_PER_PAGE });
  } catch (err) {
    console.error('[app-api] Erreur GET /app/forum/topics :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

router.get('/app/forum/topics/:slug', async (req, res) => {
  const page = pageOf(req.query.page);
  const slug = String(req.params.slug || '').slice(0, 200);
  try {
    const t = await pool.query(
      `SELECT ft.id, ft.slug, ft.title, ft.category, ft.reply_count, ft.last_reply_at, ft.locked, ft.hidden,
              ft.source_id, s.forum_slug AS source_slug, s.name AS source_name,
              COALESCE(au.display_name, 'Membre') AS author, au.pseudo AS author_pseudo
         FROM forum_topics ft
         JOIN subscribers au ON au.id = ft.author_subscriber_id
         LEFT JOIN sources s ON s.id = ft.source_id
        WHERE ft.slug = $1`, [slug]);
    if (!t.rows.length || t.rows[0].hidden) return res.status(404).json({ error: 'Sujet introuvable' });
    const topic = t.rows[0];
    const p = await pool.query(
      `SELECT fp.id, fp.body, fp.created_at,
              COALESCE(s.display_name, 'Membre') AS author, s.pseudo AS author_pseudo
         FROM forum_posts fp JOIN subscribers s ON s.id = fp.author_subscriber_id
        WHERE fp.topic_id = $1 AND fp.hidden = false
        ORDER BY fp.created_at ASC LIMIT $2 OFFSET $3`,
      [topic.id, FORUM_POSTS_PER_PAGE + 1, (page - 1) * FORUM_POSTS_PER_PAGE]);
    res.set('Cache-Control', 'public, max-age=15');
    return res.status(200).json({
      topic: forumTopic(topic),
      posts: p.rows.slice(0, FORUM_POSTS_PER_PAGE).map((r) => ({
        id: Number(r.id), body: r.body, created_at: new Date(r.created_at).toISOString(),
        author: r.author, author_pseudo: r.author_pseudo || null,
      })),
      page,
      has_more: p.rows.length > FORUM_POSTS_PER_PAGE,
    });
  } catch (err) {
    console.error('[app-api] Erreur GET /app/forum/topics/:slug :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

router.get('/app/forum/members/:pseudo', async (req, res) => {
  const pseudo = String(req.params.pseudo || '').slice(0, 64);
  try {
    const u = await pool.query('SELECT display_name, pseudo FROM subscribers WHERE pseudo = $1', [pseudo]);
    if (!u.rows.length) return res.status(404).json({ error: 'Membre introuvable' });
    return res.status(200).json({ pseudo: u.rows[0].pseudo, display_name: u.rows[0].display_name || 'Membre' });
  } catch (err) {
    console.error('[app-api] Erreur GET /app/forum/members :', errTag(err));
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
