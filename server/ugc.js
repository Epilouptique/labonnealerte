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

// V3 · jeu ÉLARGI, réservé aux libellés de tâche à échéance (usage domestique très
// concret : « Vidange (voiture) », « Rév. 20 000 km », « Chaudière + adoucisseur »).
// Ajoute . , ( ) ° + & : au jeu commun. N'ajoute VOLONTAIREMENT ni « / » ni « @ » :
// le CHECK SQL user_tasks_label_chk les interdit (label !~ '[/@]'). Les laisser
// passer ici ferait remonter l'erreur PG brute que cette validation existe pour
// éviter. Le jeu commun ALLOWED_TEXT reste inchangé pour les decks et les pseudos.
const ALLOWED_TASK_LABEL = /^[\p{L}\p{N} '’\-.,()°+&:‍️\p{Extended_Pictographic}]+$/u;

// Longueur en points de code (les émojis comptent pour 1-2, on reste indulgent).
function cpLength(s) { return Array.from(String(s)).length; }

// Valide un texte UGC (nom/description de deck, ou pseudo). Options : { min, max,
// allowEmpty, noAt, allowed }. `allowed` remplace le jeu de caractères par défaut
// (voir validateTaskLabel). Retourne { ok, value } (trimmé) ou { ok:false, error }.
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
  if (!(opts.allowed || ALLOWED_TEXT).test(s)) return { ok: false, error: 'caractères non autorisés' };
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

// V3 · libellé d'une tâche à échéance (1-80 = VARCHAR(80) en base), jeu élargi.
// Le libellé n'est affiché qu'à son auteur, mais il part dans des emails de relance :
// l'anti-URL commun (URL_LIKE) s'applique donc aussi.
function validateTaskLabel(raw) {
  return validateText(raw, { min: 1, max: 80, allowed: ALLOWED_TASK_LABEL });
}

function isValidEmoji(e) { return typeof e === 'string' && EMOJI_SET.has(e); }

/* ------------------------------------------------------------------ */
/* Forum : validation titre + corps de message.                        */
/* ------------------------------------------------------------------ */

// Titre de sujet : court, une seule ligne, URL INTERDITE (les titres-spam de
// liens sont le vrai vecteur). Réutilise validateText tel quel avec un charset
// élargi à la ponctuation courante d'un titre (?, !, :, …) mais SANS saut de
// ligne — URL_LIKE reste appliqué par validateText.
const ALLOWED_FORUM_TITLE = /^[\p{L}\p{N} '’\-.,?!:()°+&\p{Extended_Pictographic}]+$/u;
function validateForumTitle(raw) {
  return validateText(raw, { min: 5, max: 140, allowed: ALLOWED_FORUM_TITLE });
}

// Mots bloqués dans le CORPS (spam évident). Comparaison sur une forme
// normalisée (casse/accents/séparateurs retirés) → « V-i-a-g-r-a » est attrapé.
// Extensible SANS migration : ajouter une entrée ici suffit. Volontairement
// court au démarrage ; les autres filets sont le rate-limit + le report/auto-masquage.
const WATCHED_WORDS = [
  'viagra', 'cialis', 'casino', 'porn', 'xxx', 'crypto-signal', 'seoservice',
  'buyfollowers', 'escort', 'onlyfans',
];

// Corps de message : multi-lignes, ponctuation, longueur 1-5000. URLs TOLÉRÉES
// (on N'applique PAS URL_LIKE) — le filet anti-spam est WATCHED_WORDS + le
// rate-limit + le signalement/auto-masquage côté route. Jeu de caractères
// délibérément large (retours à la ligne, ponctuation, symboles courants).
const ALLOWED_FORUM_BODY = /^[\p{L}\p{N}\s'’\-.,?!:;()\[\]{}°+&%€$#@/\\*_"«»…\p{Extended_Pictographic}]+$/u;
function validateForumBody(raw) {
  if (raw == null) raw = '';
  if (typeof raw !== 'string') return { ok: false, error: 'texte invalide' };
  // Normalise les fins de ligne, borne les sauts multiples, trim les extrémités.
  const s = String(raw).replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (s === '') return { ok: false, error: 'message requis' };
  const len = cpLength(s);
  if (len < 1) return { ok: false, error: 'message requis' };
  if (len > 5000) return { ok: false, error: 'message trop long (max 5000)' };
  if (!ALLOWED_FORUM_BODY.test(s)) return { ok: false, error: 'caractères non autorisés' };
  const norm = normalizeForBan(s);
  for (const w of WATCHED_WORDS) {
    if (norm.includes(w)) return { ok: false, error: 'ce message a été bloqué (contenu non autorisé)' };
  }
  return { ok: true, value: s };
}

/* ------------------------------------------------------------------ */
/* Lien externe (cartes communautaires animal perdu) : liste BLANCHE de */
/* domaines, à l'inverse du reste du fichier (liste noire de mots). Un */
/* champ Lien est facultatif mais, s'il est renseigné, doit pointer    */
/* vers un service de signalement d'animaux perdus reconnu.            */
/* ------------------------------------------------------------------ */
const ALLOWED_LINK_DOMAINS = [
  'i-cad.fr', 'filalapat.fr', 'spa.asso.fr', '30millionsdamis.fr',
];

// Valide une URL de lien optionnel contre ALLOWED_LINK_DOMAINS (domaine exact ou
// sous-domaine). Vide/absent → { ok:true, value:null } (champ facultatif).
function validateLink(raw) {
  if (raw == null || String(raw).trim() === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (cpLength(s) > 300) return { ok: false, error: 'lien trop long (max 300)' };
  let url;
  try { url = new URL(s); } catch (e) { return { ok: false, error: 'lien invalide' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'lien invalide' };
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_LINK_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  if (!allowed) return { ok: false, error: 'Lien refusé — domaines autorisés : ' + ALLOWED_LINK_DOMAINS.join(', ') };
  return { ok: true, value: url.toString() };
}

// Token de partage non devinable (22 caractères base64url ≈ 128 bits).
function genShareToken() { return crypto.randomBytes(16).toString('base64url'); }
// Id interne d'un deck (non exposé publiquement ; le partage passe par share_token).
function genDeckId() { return 'deck_' + crypto.randomBytes(9).toString('base64url'); }

// Hachage d'IP pour les signalements (RGPD : jamais d'IP en clair). Sel de déploiement
// OBLIGATOIRE : plus de fallback en dur (un sel public rendrait les hachages réversibles
// par table arc-en-ciel sur l'espace IPv4). Absence = échec bruyant au chargement du module
// (donc au démarrage du serveur, ugc.js étant requis par la chaîne d'init), jamais un
// hachage silencieusement faible.
const IP_SALT = (process.env.IP_HASH_SALT || '').trim();
if (!IP_SALT) {
  throw new Error('IP_HASH_SALT manquant : définissez la variable d\'environnement (sel de hachage des IP de signalement) avant de démarrer le serveur.');
}
function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown') + IP_SALT).digest('hex');
}

module.exports = {
  DECK_EMOJIS, isValidEmoji,
  validateText, validateDisplayName, validateDeckName, validateDeckDescription,
  validateTaskLabel,
  validateForumTitle, validateForumBody, WATCHED_WORDS, ALLOWED_FORUM_BODY,
  validateLink, ALLOWED_LINK_DOMAINS,
  genShareToken, genDeckId, hashIp,
};
