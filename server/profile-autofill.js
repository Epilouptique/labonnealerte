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
// - departement : VOLONTAIREMENT laissé vide — geoip-lite ne donne pas de correspondance
//   région→département fiable pour la France ; au moindre doute on laisse vide (RGPD + qualité).

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
    if (row.country == null && ctx && ctx.ip) {
      const code = countryFromIp(ctx.ip);
      if (code) {
        await pool.query(
          'UPDATE subscribers SET country = $1 WHERE id = $2 AND country IS NULL',
          [code, subscriberId]
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
  _trySetDisplayName: trySetDisplayName,
};
