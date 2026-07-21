// Lib partagée — HASH-DIFF de contenu tarifaire (PDF ou fragment HTML).
//
// PRINCIPE (convention « Bison Futé ») : le contenu du fichier n'est JAMAIS
// interprété. On extrait son TEXTE, on le normalise (espaces réduits, trim) et on
// calcule un hash SHA-256 du texte. Comparer ce hash au hash du cycle précédent
// suffit à détecter « quelque chose a changé » — jamais « le prix est passé à X ».
//
// Pourquoi le TEXTE et pas le binaire brut ? Les PDF (InDesign, etc.) portent des
// métadonnées (date de production, identifiants internes) qui changent SANS que le
// tarif bouge → un hash du binaire génère de faux positifs. Le hash du texte extrait
// est stable tant que le contenu lisible ne change pas (constaté sur tarifs.pdf de
// Free Mobile dans l'exploration du 19/07/2026).
//
// Dépendance : pdf-parse (Node pur, pas de binaire système type poppler). Chargée en
// require paresseux tolérant : si absente, extractPdfText throw → l'appelant dégrade
// silencieusement (jamais de fausse alerte).

const crypto = require('crypto');
const { safeFetchBuffer, BROWSER_UA } = require('../../safe-fetch');

let pdfParse = null;
try { pdfParse = require('pdf-parse'); }
catch (err) { console.warn('[hash-diff-pdf] pdf-parse indisponible → extraction PDF désactivée.'); }

// Normalise un texte pour un hash stable : espaces multiples réduits à un seul, trim.
function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// SHA-256 hexadécimal du texte normalisé.
function hashText(text) {
  return crypto.createHash('sha256').update(normalizeText(text), 'utf8').digest('hex');
}

// Télécharge un PDF (via safe-fetch, anti-SSRF, User-Agent navigateur) et en extrait
// le TEXTE. Peut throw (réseau, PDF illisible, pdf-parse absent).
async function extractPdfText(url, opts = {}) {
  if (!pdfParse) throw new Error('pdf-parse indisponible');
  const buf = await safeFetchBuffer(url, {
    timeoutMs: opts.timeoutMs || 15_000,
    maxBytes: opts.maxBytes,
    headers: Object.assign({ 'User-Agent': BROWSER_UA }, opts.headers || {}),
  });
  const data = await pdfParse(buf);
  return normalizeText(data && data.text);
}

// Signature { hash, extractedAt } du TEXTE d'un PDF distant. Throw si texte vide
// (PDF scanné/illisible) pour éviter qu'un hash de chaîne vide fasse figure de
// référence (deux échecs d'extraction se ressembleraient à tort).
async function hashPdf(url, opts = {}) {
  const text = await extractPdfText(url, opts);
  if (!text) throw new Error('texte PDF vide');
  return { hash: hashText(text), extractedAt: new Date() };
}

module.exports = { normalizeText, hashText, extractPdfText, hashPdf };
