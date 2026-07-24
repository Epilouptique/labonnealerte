// Lib partagée — RÉCUPÉRATION + PARSING d'une page collectivité PanneauPocket
// (app.panneaupocket.com/ville/…). Extraite de sources/panneaupocket.js pour être réutilisée
// par les cartes THÉMATIQUES pré-remplies (ex. arrosage-canal-gap) sans dupliquer la logique.
//
// La page /ville/ est rendue CÔTÉ SERVEUR (Symfony/Turbo) : tous les panneaux sont dans le
// HTML brut, sans JS. Sélecteurs stables (exploration Phase 1) :
//   • bloc panneau  : div.sign-carousel--item[data-id="…"]
//   • ID PUBLIC     : ...?panneau=<ID> (URL de PARTAGE du bloc) — lien direct + clé de dédup.
//                     ⚠️ ≠ data-id (interne) ; ⚠️ ≠ 1er ?panneau= du bloc (= lien « Suivant »).
//   • titre / texte : .sign-preview__content > .title / .content
//   • collectivité  : .sign-preview__title .city
//   • tampon annulé : <img src="…/sign-cancel-status/…" class="overlay">
//   • PDF joint     : <a href="/pdf/sign_pdf/…​.pdf" target="_blank">
//
// ⚠️ ANTI-SSRF : l'URL peut venir de l'utilisateur → validPanneauUrl (https, hôte EXACT,
// chemin /ville/) EN AMONT, puis safeFetchText (pas de redirection, taille plafonnée, timeout).

const { safeFetchText, BROWSER_UA } = require('../../safe-fetch');
const { visibleText } = require('./hash-diff-html');
const { hashText, normalizeText } = require('./hash-diff-pdf');

const HOST = 'app.panneaupocket.com';
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;   // 1 Mo (page /ville/ observée ~70 Ko, marge large)
const MAX_PANNEAUX = 80;         // garde-fou (grosses collectivités)

// Validation stricte de l'URL PanneauPocket : https, hôte exact, chemin /ville/…
function validPanneauUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname.toLowerCase() !== HOST) return null;
  if (!u.pathname.startsWith('/ville/')) return null;
  return u;
}

// Décodage minimal des entités HTML pour l'AFFICHAGE (titre, collectivité).
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#0*39;|&#x27;|&apos;/gi, '’')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hash d'un panneau : titre + texte visible + état annulé (jamais denoisé — un panneau n'est
// pas une horloge ; masquer les dates ferait manquer une vraie modification de créneau).
function panneauHash(titleHtml, contentHtml, cancelled) {
  const text = normalizeText(visibleText(titleHtml) + ' ' + visibleText(contentHtml));
  return hashText(text + (cancelled ? ' [ANNULE]' : ''));
}

// Parse le HTML de la page /ville/ →
//   { city, items:[{ id, title, text, cancelled, pdfUrl, hash }] }.
// text = texte visible du contenu (utile aux filtres thématiques) ; pdfUrl = PDF joint (ou null).
function parsePanneaux(html) {
  const h = String(html || '');
  const cityM = h.match(/<p class="city"[^>]*>([\s\S]*?)<\/p>/);
  const city = cityM ? decodeEntities(cityM[1]) : '';

  // Découpage par bloc panneau (positions des marqueurs sign-carousel--item).
  const marker = /<div class="sign-carousel--item[^"]*" data-id="\d+">/g;
  const positions = [];
  let m;
  while ((m = marker.exec(h))) positions.push(m.index);
  positions.push(h.length);

  const items = [];
  const seen = new Set();
  for (let i = 0; i < positions.length - 1 && items.length < MAX_PANNEAUX; i++) {
    const seg = h.slice(positions[i], positions[i + 1]);
    // ID PUBLIC = ?panneau=<id> DE CE panneau : on lit l'URL de PARTAGE du bloc
    // (facebook-share-share-url-value). ⚠️ NE PAS prendre le 1er ?panneau= du segment :
    // c'est le lien « Suivant » (id du panneau suivant) et il apparaît AVANT.
    const idM = seg.match(/facebook-share-share-url-value="[^"]*[?&]panneau=(\d+)"/)
      || seg.match(/social-share[\s\S]*?[?&]panneau=(\d+)/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const titleM = seg.match(/<div class="sign-preview__content">[\s\S]*?<div class="title">\s*([\s\S]*?)\s*<\/div>/);
    const contentM = seg.match(/<div class="content">\s*([\s\S]*?)<\/div>/);
    const pdfM = seg.match(/<a[^>]+href="(\/pdf\/[^"]+\.pdf)"/);
    const cancelled = /sign-cancel-status\//.test(seg);
    const title = titleM ? decodeEntities(titleM[1]) : '(sans titre)';
    const text = contentM ? visibleText(contentM[1]) : '';
    const pdfUrl = pdfM ? `https://${HOST}${pdfM[1]}` : null;
    items.push({
      id, title, text, cancelled, pdfUrl,
      hash: panneauHash(titleM ? titleM[1] : '', contentM ? contentM[1] : '', cancelled),
    });
  }
  return { city, items };
}

// Récupère + parse une page /ville/ (anti-SSRF, UA navigateur). urlHref DOIT être déjà validé
// par validPanneauUrl. Peut throw (réseau/parsing) → l'appelant dégrade silencieusement.
async function fetchPanneaux(urlHref, opts = {}) {
  const html = await safeFetchText(urlHref, {
    timeoutMs: opts.timeoutMs || TIMEOUT_MS,
    maxBytes: opts.maxBytes || MAX_BYTES,
    accept: 'text/html',
    headers: { 'User-Agent': BROWSER_UA },
  });
  return parsePanneaux(html);
}

module.exports = {
  HOST, TIMEOUT_MS, MAX_BYTES, MAX_PANNEAUX,
  validPanneauUrl, decodeEntities, panneauHash, parsePanneaux, fetchPanneaux,
};
