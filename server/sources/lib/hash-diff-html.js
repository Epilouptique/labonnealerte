// Lib partagée — HASH-DIFF de PAGE HTML (veille-page, veille-stock). Voisine de
// hash-diff-pdf.js dont elle réutilise hashText/normalizeText.
//
// PRINCIPE (convention « Bison Futé ») : on n'interprète JAMAIS le contenu. On extrait le
// TEXTE VISIBLE d'une page, on neutralise les séquences dynamiques (« denoise »), puis on
// hashe. Un hash différent = « quelque chose a changé », jamais « quoi ».
//
// Testé en exploration sur service-public.fr et wikipedia (hash stable en double-fetch).

const { hashText, normalizeText } = require('./hash-diff-pdf');

// Extrait le TEXTE VISIBLE d'un HTML : retire script/style/noscript/svg/commentaires, puis
// toutes les balises, décode grossièrement les entités, normalise les espaces.
function visibleText(html) {
  let h = String(html || '');
  h = h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  h = h.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  h = h.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  h = h.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<[^>]+>/g, ' ');
  h = h.replace(/&[a-z]+;|&#\d+;/gi, ' '); // entités → espace (on ne cherche pas la fidélité, juste la stabilité)
  return normalizeText(h);
}

// Neutralise les séquences dynamiques (horloges, compteurs, « dernière visite », dates en
// direct) : toute suite commençant par un chiffre et faite de chiffres/espaces/séparateurs
// horaires devient un marqueur neutre. Réduit fortement les faux positifs.
function denoise(text) {
  return String(text || '').replace(/\b\d[\d\s:/.,h-]{2,}\b/g, ' # ');
}

// Signature { hash, extractedAt } du texte visible DENOISÉ d'un HTML déjà récupéré.
function hashHtml(html) {
  const text = denoise(visibleText(html));
  return { hash: hashText(text), extractedAt: new Date() };
}

module.exports = { visibleText, denoise, hashHtml };
