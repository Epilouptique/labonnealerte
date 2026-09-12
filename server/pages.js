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

const publicDir = path.join(__dirname, '..', 'public');
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
  const html = fs.readFileSync(path.join(publicDir, file), 'utf8')
    .replace('<!--FOOTER-->', () => footerHtml());
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
  try {
    sendPage(res, file);
  } catch (err) {
    if (err.code === 'ENOENT') return next();
    next(err);
  }
}

module.exports = { footerHtml, renderPage, sendPage, pagesMiddleware };
