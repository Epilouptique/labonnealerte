// Auto-remplissage silencieux du profil à la PREMIÈRE connexion (best-effort).
// Ne remplit QUE les champs NULL — n'écrase JAMAIS une valeur déjà renseignée.
// Ne lève jamais d'erreur dans le flux de connexion (tout est try/catch au point d'appel).
//
// - display_name : dérivé d'un indice de nom (Google given_name / GitHub name|login /
//   partie locale de l'email). Validé par ugc.validateDisplayName. En cas de collision
//   d'unicité, on suffixe sobrement (Hugo → Hugo2 → Hugo3…). L'auto-remplissage NE COMPTE
//   PAS comme un changement de pseudo (aucune écriture dans display_name_changes).
// - country : déduit de l'IP via geoip-lite (dataset LOCAL, zéro appel réseau, aucune clé).
//   Mappé sur un code autorisé, sinon « AUTRE ». L'IP n'est PAS conservée pour cet usage.
// - departement : JAMAIS pré-rempli automatiquement. Le pré-remplissage via geoip-lite a
//   été retiré : testé en réel (Gap → « Champs-sur-Marne », area:20, sous le seuil de
//   confiance mais faux de ~600 km), il a prouvé que le champ `area` de geoip mesure la
//   CONFIANCE de l'estimation, pas son EXACTITUDE — aucun seuil ne fiabilise cette donnée
//   au niveau département. Le champ reste NULL par défaut, à saisir manuellement dans Mon
//   compte. Le plus-proche-voisin (departements-geo.js) est conservé intact pour un usage
//   futur sur une source fiable (ex. géolocalisation navigateur consentie).

const geoip = require('geoip-lite');
const { validateDisplayName } = require('./ugc');
const { isValidCountry } = require('./geo');

// "hugo.vialjaime@x" → "Hugo" ; "jean-marc42@x" → "Jean-marc" ; s'arrête au 1er point/chiffre.
function deriveDisplayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const first = local.split(/[.\d]/)[0] || local; // avant point ou chiffre
  const cleaned = first.replace(/[^\p{L}'’-]/gu, '');
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function deriveDisplayNameFromGithub(name, login) {
  const fromName = String(name || '').trim().split(/\s+/)[0];
  return fromName || String(login || '').trim() || null;
}

// Cherche un pseudo libre à partir d'une base validée : base, base2, base3… (max 8 essais).
// Chaque candidat doit repasser validateDisplayName (longueur ≤25, jetons interdits…).
async function trySetDisplayName(pool, id, hint) {
  const base = validateDisplayName(hint);
  if (!base.ok) return null;
  for (let i = 0; i <= 7; i++) {
    const candidate = i === 0 ? base.value : `${base.value}${i + 1}`;
    const v = validateDisplayName(candidate);
    if (!v.ok) continue;
    try {
      const upd = await pool.query(
        'UPDATE subscribers SET display_name = $1 WHERE id = $2 AND display_name IS NULL RETURNING display_name',
        [v.value, id]
      );
      if (upd.rows.length) return upd.rows[0].display_name; // posé
      // rows.length 0 → display_name n'était déjà plus NULL : on n'écrase pas.
      return null;
    } catch (e) {
      if (e.code === '23505') continue; // collision d'unicité → suffixe suivant
      throw e;
    }
  }
  return null; // tous pris / invalides → on laisse NULL
}

function countryFromIp(ip) {
  const geo = geoip.lookup(String(ip || '').replace(/^::ffff:/, ''));
  if (!geo || !geo.country) return null;
  return isValidCountry(geo.country) ? geo.country : 'AUTRE';
}

// Adresses privées/réservées : geoip ne les résout pas. Inclut le CGNAT 100.64/10
// (réseau interne de Railway) — c'était la cause de country vide : `trust proxy: 1`
// ne pèle qu'un saut et laissait une IP interne dans req.ip.
function isPrivateIp(ip) {
  if (!ip) return true;
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;                          // link-local IPv4
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true; // 100.64/10 CGNAT (Railway)
  if (/^(fc|fd|fe80)/i.test(ip)) return true;                       // ULA + link-local IPv6
  return false;
}

// Vraie IP cliente. Ordre de priorité :
//  1. CF-Connecting-IP : injecté par Cloudflare (frontal du domaine), contient la vraie
//     IP du visiteur — IPv4 OU IPv6 selon ce qu'il utilise. Plus fiable que XFF (pas de
//     chaîne d'intermédiaires, pas de CGNAT Railway). ⚠️ Infalsifiable UNIQUEMENT tant que
//     Railway n'est joignable QUE via Cloudflare : un accès direct à *.up.railway.app
//     permettrait de forger cet en-tête (cf. note sécurité — risque connu, à couvrir par
//     Authenticated Origin Pull ou header secret Cloudflare→origine).
//  2. Repli : x-forwarded-for (premier IP PUBLIC, filtrage CGNAT 100.64/10), puis req.ip.
// isPrivateIp() s'applique aussi au résultat CF (IPv6 globale acceptée, ULA/link-local non).
function clientIp(req) {
  const cf = req && req.headers && req.headers['cf-connecting-ip'];
  if (cf) {
    const ip = String(cf).trim().replace(/^::ffff:/, '');
    if (ip && !isPrivateIp(ip)) return ip;
  }
  const xff = String((req && req.headers && req.headers['x-forwarded-for']) || '');
  const chain = xff.split(',').map((s) => s.trim()).filter(Boolean);
  if (req && req.ip) chain.push(req.ip);
  for (const c of chain) {
    const ip = c.replace(/^::ffff:/, '');
    if (!isPrivateIp(ip)) return ip;
  }
  return null;
}

/**
 * Remplit les champs NULL du profil. Best-effort, silencieux.
 * @param {import('pg').Pool} pool
 * @param {number} subscriberId
 * @param {{ nameHint?: string, ip?: string }} ctx
 */
async function applyAutofill(pool, subscriberId, ctx) {
  try {
    const cur = await pool.query(
      'SELECT display_name, country FROM subscribers WHERE id = $1',
      [subscriberId]
    );
    const row = cur.rows[0];
    if (!row) return;

    if (row.display_name == null && ctx && ctx.nameHint) {
      await trySetDisplayName(pool, subscriberId, ctx.nameHint);
    }

    // Pays : déduit de l'IP si non renseigné.
    if (row.country == null && ctx && ctx.ip) {
      const code = countryFromIp(ctx.ip);
      if (code) {
        await pool.query(
          "UPDATE subscribers SET country = $1, country_source = 'auto' WHERE id = $2 AND country IS NULL",
          [code, subscriberId]
        );
      }
    }

    // Département : JAMAIS pré-rempli automatiquement (voir en-tête du fichier). Reste
    // NULL jusqu'à saisie manuelle dans Mon compte.
  } catch (err) {
    console.warn('[profile-autofill] non bloquant :', err.message);
  }
}

module.exports = {
  applyAutofill,
  deriveDisplayNameFromEmail,
  deriveDisplayNameFromGithub,
  countryFromIp,
  clientIp,
  isPrivateIp,
  _trySetDisplayName: trySetDisplayName,
};
