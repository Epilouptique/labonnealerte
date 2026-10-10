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

// Paramètres d'exécution (broadcast) d'une source communautaire selon son moteur.
// Pour l'agenda, préavis par défaut = 1 jour (non configurable à la création — cf. rapport).
function engineParams(engine, url) {
  const E = ENGINE_BY_NAME[engine];
  if (!E) return null;
  const p = { [E.key]: url };
  if (engine === 'veille-agenda') p.preavis = '1';
  return p;
}

// Construit, pour le poller, une source broadcast { id, check } qui délègue au
// module générique SANS écrire en base (l'écriture se fait dans processSource).
// requireFn injectable pour les tests. Renvoie null si moteur inconnu / URL absente.
function buildEngineSource(row, requireFn) {
  const E = ENGINE_BY_NAME[row && row.engine];
  if (!E || !row.endpoint_url) return null;
  const req = requireFn || require;
  let mod;
  try { mod = req(E.modulePath); } catch { return null; }
  if (!mod || typeof mod.checkWithParams !== 'function') return null;
  return {
    id: row.id,
    check: async () => {
      const out = await mod.checkWithParams([engineParams(row.engine, row.endpoint_url)]);
      const r = Array.isArray(out) ? out[0] : null;
      return r || { state: 'inactive', since: null, until: null, message: null, url: row.endpoint_url };
    },
  };
}

module.exports = {
  STATUSES, TRANSITIONS, canTransition, isOwner,
  MAX_UNPUBLISHED, MAX_TOTAL, UNPUBLISHED_STATUSES, checkQuota,
  ENGINES, ENGINE_BY_NAME, validateCreate, engineParams, buildEngineSource, HTTPS_RE,
};
