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
// - departement : PRÉ-REMPLI (best-effort) quand geoip donne une localisation FR précise
//   (city non vide → ll fiable), via le plus proche centroïde départemental. Voir
//   departements-geo.js. C'est un simple CHAMP DE PROFIL éditable dans Mon compte : il
//   n'active/coche/souscrit RIEN tout seul, et une erreur reste sans conséquence. Au
//   moindre doute (hors FR, city vide, ll absent) on laisse vide.

const geoip = require('geoip-lite');
const { validateDisplayName } = require('./ugc');
const { isValidCountry } = require('./geo');
const { departementFromGeo } = require('./departements-geo');

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

// Département FR pré-rempli à partir de l'IP (null si non résolu de façon fiable).
function departementFromIp(ip) {
  const geo = geoip.lookup(String(ip || '').replace(/^::ffff:/, ''));
  const dep = departementFromGeo(geo);
  // DIAGNOSTIC TEMPORAIRE (bug Gap→93) : trace la sortie BRUTE geoip pour juger le
  // seuil `area` en conditions réelles. À RETIRER une fois le seuil validé sur les logs.
  try {
    if (geo && geo.country === 'FR') {
      console.log('[dept-diag]', JSON.stringify({
        region: geo.region, city: geo.city, ll: geo.ll, area: geo.area, resolu: dep,
      }));
    }
  } catch (e) { /* non bloquant */ }
  return dep;
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

// Vraie IP cliente : premier IP PUBLIC de x-forwarded-for (le plus à gauche = client
// d'origine), repli sur req.ip. Robuste quel que soit le nombre de sauts de proxy.
function clientIp(req) {
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
      'SELECT display_name, country, departement FROM subscribers WHERE id = $1',
      [subscriberId]
    );
    const row = cur.rows[0];
    if (!row) return;

    if (row.display_name == null && ctx && ctx.nameHint) {
      await trySetDisplayName(pool, subscriberId, ctx.nameHint);
    }

    // Pays : déduit de l'IP si non renseigné.
    let effectiveCountry = row.country;
    if (row.country == null && ctx && ctx.ip) {
      const code = countryFromIp(ctx.ip);
      if (code) {
        await pool.query(
          "UPDATE subscribers SET country = $1, country_source = 'auto' WHERE id = $2 AND country IS NULL",
          [code, subscriberId]
        );
        effectiveCountry = code;
      }
    }

    // Département : pré-rempli UNIQUEMENT si le pays (existant ou tout juste déduit) est
    // la France et que le champ est encore vide. Écriture LIMITÉE à subscribers (profil) :
    // rien n'est touché dans subscriptions ni source_param_states → aucune activation.
    if (row.departement == null && effectiveCountry === 'FR' && ctx && ctx.ip) {
      const dep = departementFromIp(ctx.ip);
      if (dep) {
        await pool.query(
          "UPDATE subscribers SET departement = $1, departement_source = 'auto' WHERE id = $2 AND departement IS NULL",
          [dep, subscriberId]
        );
      }
    }
  } catch (err) {
    console.warn('[profile-autofill] non bloquant :', err.message);
  }
}

module.exports = {
  applyAutofill,
  deriveDisplayNameFromEmail,
  deriveDisplayNameFromGithub,
  countryFromIp,
  departementFromIp,
  clientIp,
  isPrivateIp,
  _trySetDisplayName: trySetDisplayName,
};
