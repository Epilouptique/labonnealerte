// Extraction d'une ZONE d'une page HTML pour veille-page (LOT 3) — sans dépendance.
// Sélecteur SIMPLE uniquement : balise (`article`), #id (`#prix`), .classe (`.tarif`),
// ou combinaison `balise#id` / `balise.classe`. AUCUNE évaluation dynamique : on ne fait
// que de la recherche de chaîne/regex bornée. Si aucune zone n'est fournie, l'appelant
// garde le comportement actuel (hash de la page entière) → compat des sources existantes.
//
// Recommandation : pour une robustesse accrue (sélecteurs complexes, HTML malformé), on
// pourrait ajouter `node-html-parser` (léger, zéro binaire natif, ~100 Ko, parseur +
// querySelector). NON installé ici : l'extracteur conservateur ci-dessous suffit aux
// sélecteurs simples demandés et évite d'alourdir les dépendances.
'use strict';

const { visibleText } = require('./hash-diff-html');

const SELECTOR_RE = /^(?:[a-zA-Z][a-zA-Z0-9]{0,20})?(?:[#.][A-Za-z][\w-]{0,50})?$/;

// Valide un sélecteur simple. Rejette espaces, combinateurs, pseudo-classes, crochets, etc.
function isValidSelector(sel) {
  if (typeof sel !== 'string') return false;
  const s = sel.trim();
  if (!s || s.length > 64) return false;
  if (!SELECTOR_RE.test(s)) return false;
  // Doit contenir au moins une contrainte (tag, #id ou .class).
  return /[a-zA-Z]/.test(s);
}

// '#id' | '.class' | 'tag' | 'tag#id' | 'tag.class' → { tag, id, cls } (minuscule).
function parseSelector(sel) {
  if (!isValidSelector(sel)) return null;
  const s = sel.trim();
  const out = { tag: null, id: null, cls: null };
  const m = s.match(/^([a-zA-Z][a-zA-Z0-9]{0,20})?(?:([#.])([A-Za-z][\w-]{0,50}))?$/);
  if (!m) return null;
  if (m[1]) out.tag = m[1].toLowerCase();
  if (m[2] === '#') out.id = m[3];
  else if (m[2] === '.') out.cls = m[3];
  if (!out.tag && !out.id && !out.cls) return null;
  return out;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Renvoie le HTML INTERNE du PREMIER élément correspondant, ou null si introuvable.
// Équilibre les imbrications de même balise ; gère les balises auto-fermantes (<x/>) → ''.
function extractZone(html, sel) {
  const s = parseSelector(sel);
  if (!s) return null;
  const h = String(html || '');
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(h))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const selfClose = m[3] === '/';
    if (s.tag && tag !== s.tag) continue;
    if (s.id && !new RegExp(`\\bid\\s*=\\s*["']?${escapeRe(s.id)}(?=["'\\s>]|$)`, 'i').test(attrs)) continue;
    if (s.cls) {
      const cm = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
      if (!cm || !cm[1].split(/\s+/).includes(s.cls)) continue;
    }
    if (selfClose) return '';
    // Équilibrage des balises de même nom à partir de la fin de la balise ouvrante.
    const openRe = new RegExp(`<${escapeRe(tag)}(?:\\s[^>]*?)?(\\/?)>`, 'gi');
    const closeRe = new RegExp(`</${escapeRe(tag)}\\s*>`, 'gi');
    let depth = 1;
    let pos = tagRe.lastIndex;
    while (depth > 0) {
      closeRe.lastIndex = pos; openRe.lastIndex = pos;
      const c = closeRe.exec(h);
      if (!c) return null; // pas de fermeture → zone inexploitable
      const o = openRe.exec(h);
      if (o && o.index < c.index) {
        if (o[1] !== '/') depth += 1; // balise ouvrante imbriquée (hors auto-fermante)
        pos = o.index + o[0].length;
      } else {
        depth -= 1;
        if (depth === 0) return h.slice(tagRe.lastIndex, c.index);
        pos = c.index + c[0].length;
      }
    }
    return null;
  }
  return null;
}

// Texte visible d'une zone (ou de la page si pas de sélecteur) — pour l'aperçu auteur.
// Renvoie { found, text } ; found=false si une zone était demandée mais introuvable.
function zoneVisibleText(html, sel) {
  if (!sel) return { found: true, text: visibleText(html) };
  const z = extractZone(html, sel);
  if (z == null) return { found: false, text: '' };
  return { found: true, text: visibleText(z) };
}

module.exports = { isValidSelector, parseSelector, extractZone, zoneVisibleText, SELECTOR_RE };
