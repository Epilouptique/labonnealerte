// Cycle de vie d'une source communautaire (LOT 2) — LOGIQUE PURE (hors réseau,
// hors base), importée par la route /api/community-sources, le script admin et le
// poller. Les transitions, droits et quotas y sont testables unitairement.
'use strict';

const STATUSES = ['draft', 'testing', 'review', 'published', 'suspended'];

// Transitions autorisées : from -> { to: acteur }. acteur ∈ {author, admin}.
// Le refus d'une source en revue = retour en 'draft' (avec motif) : l'auteur
// corrige et resoumet. Pas de statut 'refused' distinct (enum figé à 5).
const TRANSITIONS = {
  draft:     { testing: 'author' },                 // nécessite un aperçu réussi (vérifié côté route)
  testing:   { review: 'author', draft: 'author' }, // soumission ; ou retour en brouillon
  review:    { published: 'admin', draft: 'admin' },// validation ; ou refus (retour draft+motif)
  published: { suspended: 'admin' },
  suspended: { published: 'admin', draft: 'admin' },
};

// Droit : un compte n'agit QUE sur ses propres sources.
function isOwner(source, authorId) {
  return !!source && authorId != null && source.author_subscriber_id === authorId;
}

function canTransition(from, to, actor) {
  if (!STATUSES.includes(from) || !STATUSES.includes(to)) return false;
  const allowed = TRANSITIONS[from] && TRANSITIONS[from][to];
  if (!allowed) return false;
  return allowed === actor; // l'acteur doit correspondre exactement
}

// Quotas par compte (configurables par variables d'environnement).
const MAX_UNPUBLISHED = Math.max(1, parseInt(process.env.COMMUNITY_MAX_UNPUBLISHED || '5', 10) || 5);
const MAX_TOTAL = Math.max(1, parseInt(process.env.COMMUNITY_MAX_TOTAL || '20', 10) || 20);
const UNPUBLISHED_STATUSES = ['draft', 'testing', 'review', 'suspended'];

// Vérifie un quota à partir de comptes déjà lus en base.
// { unpublished, total } -> { ok, error? }
function checkQuota({ unpublished, total }) {
  if (total >= MAX_TOTAL) {
    return { ok: false, error: `Limite atteinte : ${MAX_TOTAL} sources maximum par compte. Supprimez-en ou attendez une publication.` };
  }
  if (unpublished >= MAX_UNPUBLISHED) {
    return { ok: false, error: `Limite atteinte : ${MAX_UNPUBLISHED} sources non publiées en même temps. Terminez-en une (soumission/publication) d'abord.` };
  }
  return { ok: true };
}

// Moteurs grand public : type d'entrée -> { engine, key, label, module }.
// `key` = clé de paramètre attendue par le module ; `module` chargé à la demande.
const ENGINES = {
  page:   { engine: 'veille-page',   key: 'url',    label: 'Page web', modulePath: '../veille-page' },
  rss:    { engine: 'veille-rss',    key: 'flux',   label: 'Flux RSS/Atom', modulePath: '../veille-rss' },
  agenda: { engine: 'veille-agenda', key: 'agenda', label: 'Agenda iCal', modulePath: '../veille-agenda' },
};
// engine -> entrée ENGINES (pour le poller / dry-run à partir de la colonne engine).
const ENGINE_BY_NAME = Object.fromEntries(Object.values(ENGINES).map((e) => [e.engine, e]));

const HTTPS_RE = /^https:\/\/[^\s]{1,300}$/i;

// Valide les champs d'une création grand public. Renvoie { ok, error? , value? }.
// value = { type, engine, key, url, name, description }.
function validateCreate(body) {
  const b = body || {};
  const type = String(b.type || '').trim().toLowerCase();
  if (!ENGINES[type]) return { ok: false, error: 'Type requis : page, rss ou agenda.' };
  const url = String(b.url || '').trim();
  if (!HTTPS_RE.test(url)) return { ok: false, error: 'URL https valide requise (max 300 caractères).' };
  const name = String(b.name || '').trim();
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'Nom requis (3 à 60 caractères).' };
  const description = String(b.description || '').trim();
  if (description.length < 10 || description.length > 300) return { ok: false, error: 'Description requise (10 à 300 caractères).' };
  const E = ENGINES[type];
  return { ok: true, value: { type, engine: E.engine, key: E.key, url, name, description } };
}

// Préavis agenda : entier borné (jours). Défaut 1, bornes 0..30.
function clampPreavis(v) {
  const n = parseInt(String(v == null ? '' : v), 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(30, n));
}

// Création MINIMALE (étape « adresse ») : type + url seulement. Le nom/les catégories
// sont fournis plus tard (présentation) via PATCH. Renvoie { ok, error?, value:{type,engine,key,url} }.
function validateUrlType(body) {
  const b = body || {};
  const type = String(b.type || '').trim().toLowerCase();
  if (!ENGINES[type]) return { ok: false, error: 'Type requis : page, rss ou agenda.' };
  const url = String(b.url || '').trim();
  if (!HTTPS_RE.test(url)) return { ok: false, error: 'URL https valide requise (max 300 caractères).' };
  const E = ENGINES[type];
  return { ok: true, value: { type, engine: E.engine, key: E.key, url } };
}

// Préfixe du nom provisoire : « Brouillon — » (tiret cadratin + espaces insécables).
const PROVISIONAL_PREFIX = 'Brouillon — ';
// Nom provisoire d'un brouillon minimal, dérivé de l'hôte (3..60 car.).
function provisionalName(url) {
  let host = 'ma veille';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
  return (PROVISIONAL_PREFIX + host).slice(0, 60);
}
function isProvisionalName(name) {
  return String(name || '').indexOf(PROVISIONAL_PREFIX) === 0;
}

// Complétude requise AVANT soumission à la revue : un vrai nom ET au moins une catégorie.
// Empêche un brouillon minimal de passer en review sans présentation.
function validateSubmittable(row) {
  const name = String((row && row.name) || '').trim();
  const cats = (row && row.categories) || [];
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'Donnez un nom (3 à 60 caractères) avant de soumettre.' };
  if (isProvisionalName(name)) return { ok: false, error: 'Donnez un vrai nom à votre alerte (le nom provisoire ne peut pas être conservé).' };
  if (!Array.isArray(cats) || cats.length < 1) return { ok: false, error: 'Choisissez au moins une catégorie avant de soumettre.' };
  return { ok: true };
}

// Paramètres d'exécution (broadcast) d'une source communautaire selon son moteur,
// enrichis par la config optionnelle { zone, preavis } de l'auteur.
function engineParams(engine, url, config) {
  const E = ENGINE_BY_NAME[engine];
  if (!E) return null;
  const c = config || {};
  const p = { [E.key]: url };
  if (engine === 'veille-page' && c.zone) p.zone = String(c.zone);
  if (engine === 'veille-agenda') p.preavis = String(clampPreavis(c.preavis));
  return p;
}

// Personnalisation à la création : message (texte brut, ≤280) et lien (http/https, ≤500)
// d'alerte, tous deux optionnels. Renvoie { ok, error?, value:{ message, url } }.
const ALERT_URL_RE = /^https?:\/\/[^\s]{1,500}$/i;
function validatePersonalization(body) {
  const b = body || {};
  const out = {};
  if (b.alert_message != null && String(b.alert_message).trim() !== '') {
    const m = String(b.alert_message).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (m.length > 280) return { ok: false, error: 'Message d\'alerte trop long (280 caractères max).' };
    out.message = m;
  }
  if (b.alert_url != null && String(b.alert_url).trim() !== '') {
    const u = String(b.alert_url).trim();
    if (!ALERT_URL_RE.test(u)) return { ok: false, error: 'Lien d\'alerte invalide (http/https, 500 caractères max).' };
    out.url = u;
  }
  return { ok: true, value: out };
}

// ── Signalements ─────────────────────────────────────────────────────────────
const REPORT_REASONS = ['contenu-errone', 'spam-bruit', 'doublon', 'inapproprie', 'droits-donnees'];
const REPORT_SUSPEND_THRESHOLD = Math.max(1, parseInt(process.env.SOURCE_REPORT_SUSPEND_THRESHOLD || '3', 10) || 3);
function isValidReportReason(r) { return REPORT_REASONS.includes(String(r || '')); }
// Décide si un signalement doit déclencher la suspension automatique.
// Seules les sources 'community' PUBLISHED, au seuil de comptes distincts, basculent.
function shouldAutoSuspend({ badge, status, distinctReports }) {
  return badge === 'community' && status === 'published' && distinctReports >= REPORT_SUSPEND_THRESHOLD;
}

// ── Détection de doublons : normalisation d'URL ──────────────────────────────
const TRACKING_RE = /^(utm_|mc_|ga_|_hs|fb_)/i;
const TRACKING_EXACT = new Set(['fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'igshid', 'ref', 'ref_src', 'yclid', 'mkt_tok', 'vero_id']);
function normalizeUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = [];
  for (const [k, v] of u.searchParams) {
    if (TRACKING_RE.test(k) || TRACKING_EXACT.has(k.toLowerCase())) continue;
    params.push([k, v]);
  }
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
  let path = u.pathname.replace(/\/+$/, ''); // retire les slashs finaux
  if (path === '') path = '/';
  return `${host}${path}${qs ? '?' + qs : ''}`;
}

// Construit, pour le poller, une source broadcast { id, check } qui délègue au
// module générique SANS écrire en base (l'écriture se fait dans processSource).
// requireFn injectable pour les tests. Renvoie null si moteur inconnu / URL absente.
function parseConfig(c) {
  if (!c) return {};
  if (typeof c === 'string') { try { return JSON.parse(c) || {}; } catch { return {}; } }
  return c;
}

function buildEngineSource(row, requireFn) {
  const E = ENGINE_BY_NAME[row && row.engine];
  if (!E || !row.endpoint_url) return null;
  const req = requireFn || require;
  let mod;
  try { mod = req(E.modulePath); } catch { return null; }
  if (!mod || typeof mod.checkWithParams !== 'function') return null;
  const config = parseConfig(row.engine_config);
  return {
    id: row.id,
    check: async () => {
      const out = await mod.checkWithParams([engineParams(row.engine, row.endpoint_url, config)]);
      const r = (Array.isArray(out) ? out[0] : null)
        || { state: 'inactive', since: null, until: null, message: null, url: row.endpoint_url };
      // Personnalisation de l'auteur (appliquée seulement si l'alerte est active).
      if (r.state === 'active') {
        if (config.message) r.message = config.message;
        if (config.url) r.url = config.url;
      }
      return r;
    },
  };
}

module.exports = {
  STATUSES, TRANSITIONS, canTransition, isOwner,
  MAX_UNPUBLISHED, MAX_TOTAL, UNPUBLISHED_STATUSES, checkQuota,
  ENGINES, ENGINE_BY_NAME, validateCreate, validateUrlType, provisionalName, isProvisionalName, validateSubmittable,
  engineParams, buildEngineSource, HTTPS_RE,
  clampPreavis, validatePersonalization,
  REPORT_REASONS, REPORT_SUSPEND_THRESHOLD, isValidReportReason, shouldAutoSuspend,
  normalizeUrl,
};
