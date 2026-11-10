// pages.js — assemblage des pages HTML de public/ avec les fragments communs.
//
// Aujourd'hui un seul fragment : le footer (server/partials/footer.html), injecte a la
// place du marqueur <!--FOOTER--> que portent les pages. Il etait auparavant copie en
// dur dans 13 fichiers, qui avaient fini par diverger.
//
// PERFORMANCE : en production, chaque page est lue et assemblee UNE fois (premier
// affichage) puis servie depuis la memoire — moins d'E/S que l'ancien sendFile, qui
// relisait le disque a chaque requete. En dev, relecture a chaque requete : une edition
// du footer ou d'une page se voit sans redemarrer.
//
// CACHE HTTP : res.send() sur une chaine calcule lui-meme un ETag (reglage Express par
// defaut) et repond 304 si le navigateur a deja cette version ; on repose le meme
// Cache-Control que sendFile (public, max-age=0) -> comportement identique a avant.

const fs = require('fs');
const path = require('path');
const { publishEnabled } = require('./publish-flag');
const { appPlayUrlEnabled } = require('./app-play-flag');
const { availableImages, testForcingEnabled } = require('./encarts');

const publicDir = path.join(__dirname, '..', 'public');

// Échappe une valeur destinée à un attribut HTML entre guillemets doubles (JSON des encarts).
function attrEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Drapeaux client exposés en ATTRIBUTS sur <html> (data-lba-publish / data-lba-app-play /
// data-lba-encart-*) plutôt qu'en script inline — la CSP du site impose script-src 'self'
// (aucun inline), donc un <script> injecté serait bloqué. La CSS masque les .publish-cta et
// le bloc .appmob tant que l'attribut correspondant ne vaut pas "true". Les attributs encart
// renseignent public/js/encarts.js (visuels réellement présents + forçage de test hors prod).
function flagsAttr() {
  return ' data-lba-publish="' + (publishEnabled() ? 'true' : 'false') + '"'
    + ' data-lba-app-play="' + (appPlayUrlEnabled() ? 'true' : 'false') + '"'
    + ' data-lba-encart-img="' + attrEscape(JSON.stringify(availableImages())) + '"'
    + ' data-lba-encart-test="' + (testForcingEnabled() ? '1' : '0') + '"';
}
const footerFile = path.join(__dirname, 'partials', 'footer.html');
const CACHE = process.env.NODE_ENV === 'production';
const pageCache = new Map();
let footerCache = null;

// Footer seul (sans le commentaire d'en-tete du fragment), pour le gabarit du forum.
function footerHtml() {
  if (CACHE && footerCache !== null) return footerCache;
  const raw = fs.readFileSync(footerFile, 'utf8');
  const html = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
  if (CACHE) footerCache = html;
  return html;
}

// Page de public/ assemblee (chaine). Leve ENOENT si le fichier n'existe pas.
function renderPage(file) {
  if (CACHE && pageCache.has(file)) return pageCache.get(file);
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8')
    .replace('<!--FOOTER-->', () => footerHtml());
  // Pose les drapeaux (publication + app Play) en attributs sur <html> (une fois par page).
  html = html.replace(/<html(\s|>)/i, (m, p1) => '<html' + flagsAttr() + p1);
  if (CACHE) pageCache.set(file, html);
  return html;
}

function sendPage(res, file) {
  res.set('Cache-Control', 'public, max-age=0');
  res.type('html').send(renderPage(file));
}

// Middleware a monter AVANT express.static : sans lui, / et /xxx.html seraient servis
// bruts par le static, avec le marqueur au lieu du footer.
function pagesMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let file;
  if (req.path === '/') file = 'index.html';
  else if (/^\/[\w-]+\.html$/.test(req.path)) file = req.path.slice(1);
  else return next();
  // Parcours fermé : les pages de publication ne sont PAS servies (même en .html direct).
  // On renvoie le 404 commun ici — un simple next() laisserait express.static servir le fichier.
  if (!publishEnabled() && (file === 'publier.html' || file === 'mes-publications.html')) {
    try {
      const html = renderPage('404.html')
        .replace(/\{\{CODE\}\}/g, '404')
        .replace(/\{\{TITRE\}\}/g, 'Page introuvable')
        .replace(/\{\{MESSAGE\}\}/g, 'Cette page n’est pas disponible.');
      return res.status(404).type('html').send(html);
    } catch (e) { return res.status(404).type('html').send('Page introuvable'); }
  }
  try {
    sendPage(res, file);
  } catch (err) {
    if (err.code === 'ENOENT') return next();
    next(err);
  }
}

module.exports = { footerHtml, renderPage, sendPage, pagesMiddleware };
