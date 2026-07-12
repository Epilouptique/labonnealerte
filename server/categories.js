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

// Nettoie/valide une liste reçue : slugs connus, uniques, 1..3 éléments.
// Retourne { ok, categories, error }.
function sanitizeCategories(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'categories doit être un tableau' };
  }
  const cleaned = [];
  for (const raw of input) {
    const slug = String(raw || '').trim();
    if (!VALID_SLUGS.includes(slug)) {
      return { ok: false, error: `catégorie inconnue : ${slug}` };
    }
    if (!cleaned.includes(slug)) cleaned.push(slug);
  }
  if (cleaned.length < 1) return { ok: false, error: 'au moins une catégorie est requise' };
  if (cleaned.length > MAX_CATEGORIES) {
    return { ok: false, error: `maximum ${MAX_CATEGORIES} catégories` };
  }
  return { ok: true, categories: cleaned };
}

module.exports = { CATEGORIES, VALID_SLUGS, MAX_CATEGORIES, sanitizeCategories };
