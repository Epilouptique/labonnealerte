// Routes développeur (montées sous /api/dev) :
//  - POST /validate-manifest : récupère l'URL d'un manifeste OpenAlert et le valide
//    (fetch sécurisé anti-SSRF, timeout 5s, taille max 100 Ko).
//  - POST /submit-source : enregistre une proposition de source (enabled = false).
//
// Un rate-limiter en mémoire (par IP, 10 req/min) protège ces deux routes.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { sanitizeCategories } = require('../categories');
const { safeFetchJson } = require('../safe-fetch');
const { validateParamsSchema, exampleParams } = require('../params');

const router = express.Router();

const STATE_ENUM = ['active', 'inactive', 'pending'];

/* ------------------------------------------------------------------ */
/* Rate-limiting en mémoire : 10 requêtes / minute / IP.               */
/* ------------------------------------------------------------------ */
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;
const hits = new Map(); // ip -> [timestamps]

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute.' });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

// Purge périodique des IP inactives (évite la fuite mémoire).
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const recent = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}, RATE_WINDOW_MS).unref();

// Récupère le manifeste avec toutes les protections anti-SSRF (module partagé).
function fetchManifest(rawUrl) {
  return safeFetchJson(rawUrl);
}

/* ------------------------------------------------------------------ */
/* Validation du schéma OpenAlert v0.1.                                */
/* ------------------------------------------------------------------ */
function isIso8601(v) {
  if (typeof v !== 'string') return false;
  // Doit ressembler à une date ISO ET être parsable.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(v)) return false;
  return !Number.isNaN(Date.parse(v));
}

function validateManifest(m) {
  const checks = [];
  const req = (field, ok, message) => checks.push({ field, ok, message });

  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    return { valid: false, checks: [{ field: '(racine)', ok: false, message: 'Le manifeste doit être un objet JSON' }] };
  }

  // Champs requis
  req('id', typeof m.id === 'string' && m.id.length > 0,
    typeof m.id === 'string' && m.id.length > 0 ? 'identifiant présent' : 'requis : chaîne non vide');
  req('name', typeof m.name === 'string' && m.name.length > 0,
    typeof m.name === 'string' && m.name.length > 0 ? 'nom présent' : 'requis : chaîne non vide');
  req('state', STATE_ENUM.includes(m.state),
    STATE_ENUM.includes(m.state) ? `état « ${m.state} »` : `requis : l'une de ${STATE_ENUM.join(' | ')}`);
  req('checked_at', isIso8601(m.checked_at),
    isIso8601(m.checked_at) ? 'horodatage ISO 8601 valide' : 'requis : date ISO 8601');

  // Champs optionnels (null accepté)
  const optDate = (field) => {
    const v = m[field];
    const ok = v === undefined || v === null || isIso8601(v);
    req(field, ok, ok ? (v == null ? 'absent (ok)' : 'date ISO 8601 valide') : 'optionnel : ISO 8601 ou null');
  };
  optDate('since');
  optDate('until');

  const optStr = (field) => {
    const v = m[field];
    const ok = v === undefined || v === null || typeof v === 'string';
    req(field, ok, ok ? (v == null ? 'absent (ok)' : 'texte présent') : 'optionnel : chaîne ou null');
  };
  optStr('message');
  optStr('url');

  // Champ optionnel `params` (OpenAlert v2). Absent = broadcast (v1 inchangé).
  if (m.params !== undefined && m.params !== null) {
    const ps = validateParamsSchema(m.params);
    req('params', ps.ok, ps.ok
      ? `schéma de paramètres valide (source paramétrée : ${m.params[0] && m.params[0].key})`
      : `params : ${ps.error}`);
  }

  const valid = checks.every((c) => c.ok);
  return { valid, checks };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
router.post('/validate-manifest', rateLimit, async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL manquante' });
  }

  let manifest;
  try {
    manifest = await fetchManifest(url);
  } catch (err) {
    console.error('[dev] validate-manifest :', err.message);
    // On ne renvoie que des messages « publics » rédigés par nous, jamais err.message brut.
    const publicMsg = err && err.public ? err.message
      : 'Impossible de récupérer le manifeste (URL invalide, injoignable ou trop volumineuse).';
    return res.status(200).json({ valid: false, network_error: publicMsg, checks: [], manifest: null });
  }

  const { valid, checks } = validateManifest(manifest);

  // Source paramétrée : SONDE DYNAMIQUE — on interroge l'endpoint avec une valeur
  // d'exemple en query string et on vérifie que la réponse est un manifeste v1 valide.
  let probe = null;
  if (valid && manifest && manifest.params) {
    const ps = validateParamsSchema(manifest.params);
    if (ps.ok) {
      const ex = exampleParams(ps.schema);
      try {
        const u = new URL(url);
        Object.keys(ex).forEach((k) => u.searchParams.set(k, ex[k]));
        const sample = await fetchManifest(u.href); // mêmes protections SSRF
        const sub = validateManifest(sample);
        probe = { url: u.href, example: ex, valid: sub.valid, checks: sub.checks };
      } catch (err) {
        probe = { example: ex, valid: false, error: err && err.public ? err.message : 'sonde échouée' };
      }
    }
  }

  // Pour une source paramétrée, la validité globale exige que la sonde passe.
  const overallValid = valid && (!(manifest && manifest.params) || (probe && probe.valid));
  return res.status(200).json({ valid: overallValid, checks, manifest, probe });
});

// Slug ASCII à partir d'un nom libre.
function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'source';
}

router.post('/submit-source', rateLimit, async (req, res) => {
  const { name, description, manifest_url, github, email, categories, params_schema } = req.body || {};

  if (!name || typeof name !== 'string' || !manifest_url || typeof manifest_url !== 'string') {
    return res.status(400).json({ error: 'Champs requis : name et manifest_url' });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Une description courte est requise' });
  }
  try {
    // Refuse une URL de manifeste manifestement invalide.
    const u = new URL(manifest_url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('proto');
  } catch {
    return res.status(400).json({ error: 'URL de manifeste invalide' });
  }

  // Catégories : liste fermée, 1 à 3 tags.
  const cat = sanitizeCategories(categories);
  if (!cat.ok) {
    return res.status(400).json({ error: cat.error });
  }

  // Schéma de paramètres optionnel (OpenAlert v2). Validé avant stockage.
  let schemaJson = null;
  if (params_schema != null) {
    const ps = validateParamsSchema(params_schema);
    if (!ps.ok) return res.status(400).json({ error: 'params_schema : ' + ps.error });
    schemaJson = JSON.stringify(ps.schema);
  }

  try {
    // Génère un id unique : slug, + suffixe aléatoire en cas de collision.
    const base = slugify(name);
    let id = base;
    const exists = async (candidate) => {
      const { rows } = await pool.query('SELECT 1 FROM sources WHERE id = $1', [candidate]);
      return rows.length > 0;
    };
    let attempts = 0;
    while (await exists(id)) {
      id = `${base}-${crypto.randomBytes(2).toString('hex')}`; // 4 chars hex
      if (++attempts > 5) break;
    }

    // Respecte les CHECK de `sources` (description courte <=120, longue <=300) : on borne
    // la courte (117 + « … », coupe sur un espace) et on verse le texte complet dans la
    // longue (<=300). Sinon une soumission longue violerait le CHECK a l'INSERT.
    const rawDesc = description ? String(description).trim() : null;
    let descShort = rawDesc, descLong = null;
    if (rawDesc && rawDesc.length > 120) {
      descShort = rawDesc.slice(0, 117).replace(/\s\S*$/, '') + '…';
      descLong = rawDesc.slice(0, 300);
    }

    await pool.query(
      `INSERT INTO sources
         (id, name, description, description_long, type, badge, enabled, endpoint_url,
          submitted_by_github, submitted_by_email, categories, params_schema)
       VALUES ($1, $2, $3, $4, 'external', 'community', false, $5, $6, $7, $8, $9::jsonb)`,
      [
        id,
        name.slice(0, 255),
        descShort,
        descLong,
        manifest_url,
        github ? String(github).slice(0, 255) : null,
        email ? String(email).slice(0, 255) : null,
        cat.categories,
        schemaJson,
      ]
    );

    return res.status(200).json({
      message: 'Merci ! Votre source sera examinée manuellement avant publication.',
    });
  } catch (err) {
    console.error('[dev] Erreur POST /submit-source :', err.message);
    return res.status(503).json({ error: 'Service indisponible, réessayez plus tard.' });
  }
});

module.exports = router;
