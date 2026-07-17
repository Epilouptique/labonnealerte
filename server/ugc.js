// Garde-fous du contenu généré par les utilisateurs (decks + pseudos publics).
// Premier UGC du site : validation stricte AVANT stockage, tokens non devinables,
// hachage d'IP pour les signalements. Aucune dépendance externe.

const crypto = require('crypto');

// Liste FERMÉE d'émojis proposés pour les decks (pas de champ libre → pas d'émoji
// détourné en vecteur de contenu). Le client propose exactement cette liste.
const DECK_EMOJIS = [
  '📦', '🎒', '⭐', '🔥', '💡', '🎯', '🌍', '🏔️', '🌊', '🌌', '☀️', '❄️',
  '🍁', '🎮', '💻', '📈', '💰', '🎬', '🎵', '📚', '⚽', '🍽️', '🐱', '🚨',
];
const EMOJI_SET = new Set(DECK_EMOJIS);

// Motifs interdits (anti-URL / anti-spam de lien) — appliqués aux noms & descriptions.
const URL_LIKE = [
  /https?:\/\//i,
  /www\./i,
  /\b[a-z0-9-]{1,63}\.(fr|com|net|org|io|co|eu|be|ch|ca|app|dev|xyz|info|me|shop|store|link|biz|online|site|club)\b/i,
];

// Jeu de caractères autorisé : lettres (toutes langues), chiffres, espace,
// apostrophes, tiret, et émojis (pictogrammes + ZWJ + sélecteur de variation).
const ALLOWED_TEXT = /^[\p{L}\p{N} '’\-‍️\p{Extended_Pictographic}]+$/u;

// Longueur en points de code (les émojis comptent pour 1-2, on reste indulgent).
function cpLength(s) { return Array.from(String(s)).length; }

// Valide un texte UGC (nom/description de deck, ou pseudo). Options : { min, max,
// allowEmpty, noAt }. Retourne { ok, value } (trimmé) ou { ok:false, error }.
function validateText(raw, opts) {
  opts = opts || {};
  const min = opts.min || 0;
  const max = opts.max || 200;
  if (raw == null) raw = '';
  if (typeof raw !== 'string') return { ok: false, error: 'texte invalide' };
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s === '') {
    if (opts.allowEmpty) return { ok: true, value: '' };
    return { ok: false, error: 'texte requis' };
  }
  const len = cpLength(s);
  if (len < min) return { ok: false, error: `trop court (min ${min})` };
  if (len > max) return { ok: false, error: `trop long (max ${max})` };
  if (opts.noAt && s.includes('@')) return { ok: false, error: 'le caractère « @ » n\'est pas autorisé' };
  for (const re of URL_LIKE) {
    if (re.test(s)) return { ok: false, error: 'les adresses de sites ne sont pas autorisées' };
  }
  if (!ALLOWED_TEXT.test(s)) return { ok: false, error: 'caractères non autorisés' };
  return { ok: true, value: s };
}

// Normalise pour comparaison (casse/accents/séparateurs retirés).
function normalizeForBan(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
// Jetons interdits dans un pseudo (usurpation d'identité du service / de rôles).
const BANNED_NAME_TOKENS = ['labonnealerte', 'bonnealerte', 'admin', 'moderateur', 'modo', 'officiel', 'support', 'staff'];

// Valide un pseudo public : 3-25, règles texte, pas de @, et aucun jeton interdit.
function validateDisplayName(raw) {
  const base = validateText(raw, { min: 3, max: 25, noAt: true });
  if (!base.ok) return base;
  const norm = normalizeForBan(base.value);
  for (const tok of BANNED_NAME_TOKENS) {
    if (norm.includes(tok)) return { ok: false, error: 'ce nom public n\'est pas disponible' };
  }
  if (!norm) return { ok: false, error: 'nom public invalide' };
  return { ok: true, value: base.value };
}

// Valide un nom de deck (3-40) et une description (0-200, optionnelle).
function validateDeckName(raw) { return validateText(raw, { min: 3, max: 40 }); }
function validateDeckDescription(raw) { return validateText(raw, { min: 0, max: 200, allowEmpty: true }); }

function isValidEmoji(e) { return typeof e === 'string' && EMOJI_SET.has(e); }

// Token de partage non devinable (22 caractères base64url ≈ 128 bits).
function genShareToken() { return crypto.randomBytes(16).toString('base64url'); }
// Id interne d'un deck (non exposé publiquement ; le partage passe par share_token).
function genDeckId() { return 'deck_' + crypto.randomBytes(9).toString('base64url'); }

// Hachage d'IP pour les signalements (RGPD : jamais d'IP en clair). Sel de déploiement.
const IP_SALT = process.env.IP_HASH_SALT || 'lba-ugc-report-salt';
function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown') + IP_SALT).digest('hex');
}

module.exports = {
  DECK_EMOJIS, isValidEmoji,
  validateText, validateDisplayName, validateDeckName, validateDeckDescription,
  genShareToken, genDeckId, hashIp,
};
