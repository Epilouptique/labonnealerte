// Routes développeur (montées sous /api/dev) :
//  - POST /validate-manifest : récupère l'URL d'un manifeste OpenAlert et le valide
//    (fetch sécurisé anti-SSRF, timeout 5s, taille max 100 Ko).
//  - POST /submit-source : enregistre une proposition de source (enabled = false).
//
// Un rate-limiter en mémoire (par IP, 10 req/min) protège ces deux routes.

const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const { pool } = require('../db');
const { sanitizeCategories } = require('../categories');

const router = express.Router();

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 100 * 1024; // 100 Ko
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

/* ------------------------------------------------------------------ */
/* Anti-SSRF : refuse les IP privées / loopback / lien-local.          */
/* ------------------------------------------------------------------ */
function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // par prudence
  if (p[0] === 10) return true;                          // 10.0.0.0/8
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16.0.0/12
  if (p[0] === 192 && p[1] === 168) return true;         // 192.168.0.0/16
  if (p[0] === 127) return true;                         // 127.0.0.0/8 (localhost)
  if (p[0] === 169 && p[1] === 254) return true;         // 169.254.0.0/16 (link-local)
  if (p[0] === 0) return true;                           // 0.0.0.0/8
  return false;
}

function isPrivateIP(ip) {
  // Normalise les adresses IPv4-mapped (::ffff:127.0.0.1).
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  // IPv6
  const low = ip.toLowerCase();
  if (low === '::1') return true;               // loopback
  if (low === '::') return true;                // unspecified
  if (low.startsWith('fe80')) return true;      // link-local
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique local
  return false;
}

// Récupère le manifeste avec toutes les protections. Peut throw avec un message clair.
async function fetchManifest(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL invalide');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Seuls les protocoles http et https sont autorisés');
  }

  // Résolution DNS + contrôle des IP (anti-SSRF).
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error('Nom de domaine introuvable (DNS)');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address))) {
    throw new Error('Cible non autorisée (adresse privée ou locale)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'error', // pas de suivi de redirection (éviter un rebond SSRF)
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Délai dépassé (>5s) en récupérant le manifeste');
    throw new Error('Impossible de joindre l\'URL du manifeste');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Le manifeste a répondu HTTP ${res.status}`);
  }

  const declared = Number(res.headers.get('content-length'));
  if (declared && declared > MAX_BYTES) {
    throw new Error('Manifeste trop volumineux (> 100 Ko)');
  }

  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('Manifeste trop volumineux (> 100 Ko)');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Le contenu récupéré n\'est pas du JSON valide');
  }
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
    return res.status(200).json({ valid: false, network_error: err.message, checks: [], manifest: null });
  }

  const { valid, checks } = validateManifest(manifest);
  return res.status(200).json({ valid, checks, manifest });
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
  const { name, description, manifest_url, github, email, categories } = req.body || {};

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

    await pool.query(
      `INSERT INTO sources
         (id, name, description, type, badge, enabled, endpoint_url,
          submitted_by_github, submitted_by_email, categories)
       VALUES ($1, $2, $3, 'external', 'community', false, $4, $5, $6, $7)`,
      [
        id,
        name.slice(0, 255),
        description ? String(description) : null,
        manifest_url,
        github ? String(github).slice(0, 255) : null,
        email ? String(email).slice(0, 255) : null,
        cat.categories,
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
