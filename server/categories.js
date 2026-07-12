// Liste fermée des catégories d'annuaire du kiosque (tags, max 3 par source).
// Hors standard OpenAlert : c'est une donnée de plateforme.

const CATEGORIES = [
  { slug: 'bons-plans',    label: 'Bons plans' },
  { slug: 'meteo-risques', label: 'Météo & risques' },
  { slug: 'energie',       label: 'Énergie' },
  { slug: 'tech',          label: 'Tech' },
  { slug: 'transports',    label: 'Transports' },
  { slug: 'autre',         label: 'Autre' },
];

const VALID_SLUGS = CATEGORIES.map((c) => c.slug);
const MAX_CATEGORIES = 3;
const MAX_TAG_LEN = 30;

// Slug propre : minuscules, sans accents, tirets, max 30 caractères.
function slugifyTag(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LEN);
}

// Nettoie/valide une liste reçue : tags libres slugifiés, uniques, 1..3 éléments.
// Accepte désormais des catégories hors liste pré-établie. Retourne { ok, categories, error }.
function sanitizeCategories(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'categories doit être un tableau' };
  }
  const cleaned = [];
  for (const raw of input) {
    const slug = slugifyTag(raw);
    if (slug && !cleaned.includes(slug)) cleaned.push(slug);
  }
  if (cleaned.length < 1) return { ok: false, error: 'au moins une catégorie est requise' };
  if (cleaned.length > MAX_CATEGORIES) {
    return { ok: false, error: `maximum ${MAX_CATEGORIES} catégories` };
  }
  return { ok: true, categories: cleaned };
}

module.exports = { CATEGORIES, VALID_SLUGS, MAX_CATEGORIES, MAX_TAG_LEN, slugifyTag, sanitizeCategories };
