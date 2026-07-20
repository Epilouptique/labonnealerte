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
// - departement : PRÉ-REMPLI depuis le code postal IPLocate, sur la vraie IP du visiteur.
//   Historique : le pré-remplissage via geoip-lite avait été retiré (le champ `area`
//   mesure la confiance, pas l'exactitude — Gap→Champs-sur-Marne area 20, faux de 600 km).
//   Rouvert sur une base fiable : Cloudflare en frontal transmet l'IPv6 réelle du visiteur
//   (clientIp() sécurisée par ORIGIN_SECRET), et IPLocate en donne le code postal EXACT
//   (Gap→05000, confirmé en réel). On dérive le département du postal (pas d'estimation par
//   distance : departements-geo.js reste dormant/inutilisé). Garde « vide > faux » :
//   résolution absente / hors FR / postal manquant ou invalide → NULL. Champ éditable,
//   jamais activant. Écriture limitée à subscribers.

const https = require('https');
const geoip = require('geoip-lite');
const { validateDisplayName } = require('./ugc');
const { isValidCountry, isValidDepartement } = require('./geo');

// Dérive un code département FR depuis un code postal (IPLocate le fournit exact).
//  · Métropole : 2 premiers chiffres (75001→75, 05000→05).
//  · Corse (20xxx) : split par plage de code postal — 2A (Corse-du-Sud) < 20200,
//    2B (Haute-Corse) >= 20200. Règle approximative (quelques communes frontalières
//    dérogent) mais sans conséquence : champ éditable, priorité « vide > faux ».
//  · DROM (97xxx) : 3 premiers chiffres (971..976). 98xxx (COM) non valides → rejetés.
// Le résultat est TOUJOURS validé par isValidDepartement() ; sinon null (échec propre).
function departementFromPostal(postal) {
  const p = String(postal == null ? '' : postal).trim();
  if (!/^\d{5}$/.test(p)) return null;
  let code;
  if (p.startsWith('20')) code = parseInt(p, 10) < 20200 ? '2A' : '2B';
  else if (p.startsWith('97') || p.startsWith('98')) code = p.slice(0, 3);
  else code = p.slice(0, 2);
  return isValidDepartement(code) ? code : null;
}

// Lookup IPLocate best-effort, non bloquant, timeout court. Renvoie l'objet JSON ou null
// (erreur réseau / timeout / parse). Réutilise le même endpoint que scripts/test-iplocate
// et le middleware [ip-geo-diag] ; clé optionnelle via IPLOCATE_APIKEY.
function iplocateLookup(ip, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!ip) return resolve(null);
    const key = process.env.IPLOCATE_APIKEY || '';
    const url = 'https://iplocate.io/api/lookup/' + encodeURIComponent(ip) +
      (key ? '?apikey=' + encodeURIComponent(key) : '');
    const r = https.get(url, (resp) => {
      let d = '';
      resp.on('data', (c) => (d += c));
      resp.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(timeoutMs, () => { r.destroy(); resolve(null); });
  });
}

// Département FR pré-rempli à partir de l'IP via IPLocate (null si non résolu fiablement).
async function departementFromIp(ip) {
  const geo = await iplocateLookup(ip);
  if (!geo || geo.country_code !== 'FR') return null;
  return departementFromPostal(geo.postal_code);
}

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

// Avertissement de sécurité throttlé (1/min max) : cf-connecting-ip présent sans secret
// valide alors que ORIGIN_SECRET est configuré → potentielle tentative d'accès direct à
// Railway (contournement de Cloudflare) avec en-tête forgé. Discret, ne spamme pas.
let lastDirectWarnAt = 0;
function warnDirectAccess() {
  const now = Date.now();
  if (now - lastDirectWarnAt > 60000) {
    lastDirectWarnAt = now;
    console.warn('[securite] cf-connecting-ip recu sans x-origin-secret valide : ignore (acces direct Railway hors Cloudflare ?).');
  }
}

// Vraie IP cliente. Ordre de priorité :
//  1. CF-Connecting-IP : injecté par Cloudflare (frontal du domaine), contient la vraie
//     IP du visiteur — IPv4 OU IPv6 selon ce qu'il utilise. Plus fiable que XFF (pas de
//     chaîne d'intermédiaires, pas de CGNAT Railway). ⚠️ Falsifiable via un accès DIRECT à
//     *.up.railway.app (qui contourne Cloudflare). On ne lui fait donc confiance QUE si la
//     requête porte le secret partagé x-origin-secret == ORIGIN_SECRET, injecté par une
//     Transform Rule Cloudflare (connu seulement de Cloudflare et de l'origine).
//  2. Repli : x-forwarded-for (premier IP PUBLIC, filtrage CGNAT 100.64/10), puis req.ip.
// isPrivateIp() s'applique aussi au résultat CF (IPv6 globale acceptée, ULA/link-local non).
function clientIp(req) {
  const headers = (req && req.headers) || {};
  const cf = headers['cf-connecting-ip'];
  if (cf) {
    const secret = process.env.ORIGIN_SECRET;
    // Confiance accordée UNIQUEMENT si le secret est configuré ET correspond. Si le secret
    // n'est pas configuré (undefined), on n'accorde AUCUNE confiance (évite le piège
    // `undefined === undefined` d'un header absent) → repli XFF.
    if (secret && headers['x-origin-secret'] === secret) {
      const ip = String(cf).trim().replace(/^::ffff:/, '');
      if (ip && !isPrivateIp(ip)) return ip;
    } else if (secret) {
      // Secret configuré mais header absent/incorrect alors que cf-connecting-ip est là :
      // probable accès direct à Railway avec en-tête forgé. Avertissement throttlé (1/min).
      warnDirectAccess();
    }
    // Sinon (secret non configuré, ou header invalide) : cf-connecting-ip ignoré → repli.
  }
  const xff = String(headers['x-forwarded-for'] || '');
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

    // Pays : déduit de l'IP via geoip-lite si non renseigné (INCHANGÉ, fiable).
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

    // Département : pré-rempli via IPLocate (code postal exact) UNIQUEMENT si le pays
    // effectif est FR et le champ encore vide. Appel non bloquant (timeout court) : si
    // IPLocate est lent/indisponible ou ne résout rien de fiable → on laisse NULL, aucune
    // erreur. Écriture LIMITÉE à subscribers (departement + departement_source) : rien
    // dans subscriptions ni source_param_states → aucune activation d'alerte.
    if (row.departement == null && effectiveCountry === 'FR' && ctx && ctx.ip) {
      const dep = await departementFromIp(ctx.ip);
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
  departementFromPostal,
  departementFromIp,
  clientIp,
  isPrivateIp,
  _trySetDisplayName: trySetDisplayName,
};
