// forum-slug.js — génération DÉTERMINISTE du slug public d'une source pour le
// forum (tag @forum_slug + lien carte→forum). Identifiant STABLE, généré UNE
// fois (backfill + insertion d'une nouvelle source), JAMAIS régénéré au
// changement de titre (les @tags/URLs des utilisateurs ne doivent pas casser).
//
// Réutilisé par : (i) scripts/backfill-forum-slug.js, (ii) l'ajout d'une future
// source (voir procédure documentée dans le backfill), (iii) nulle part ailleurs.
//
// Règle (6 étapes validée) :
//   1. NFKD → retirer les marques combinantes (accents).
//   2. minuscule.
//   3. supprimer tout caractère ∉ [a-z0-9] (espaces, ponctuation, emoji,
//      symboles) → concaténé, SANS séparateur.
//   4. borner à 64 caractères (colonne VARCHAR(64)).
//   5. si vide après nettoyage → repli sur slugBase(id de la source).
//   6. collision → suffixe numérique (2, 3, …), l'ordre déterministe
//      (display_order puis id) décidant qui garde le slug nu. Étape gérée par
//      resolveCollision() côté appelant (backfill/insertion), pas ici.

const SLUG_MAX = 64;

// Étapes 1-4 : normalisation brute d'un texte en slug concaténé (peut être '').
function slugBase(text) {
  return String(text == null ? '' : text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // marques combinantes (accents)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')       // tout le reste : espaces, ponctuation, emoji, symboles
    .slice(0, SLUG_MAX);
}

// Slug d'une source = slugBase(titre), repli sur slugBase(id) si le titre est
// vide après nettoyage (étape 5). Ne gère PAS les collisions (voir resolveCollision).
function slugify(title, fallbackId) {
  return slugBase(title) || slugBase(fallbackId);
}

// Étape 6 : renvoie un slug LIBRE ≤ 64 à partir d'un slug de base et d'un
// ensemble `taken` des slugs déjà attribués. Le slug nu si possible, sinon un
// suffixe numérique (2, 3, …), en tronquant la racine pour rester ≤ 64.
// `taken` n'est PAS muté ici : l'appelant ajoute le résultat après coup.
function resolveCollision(base, taken) {
  const root = base || 'source';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = root.slice(0, SLUG_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

module.exports = { slugBase, slugify, resolveCollision, SLUG_MAX };
