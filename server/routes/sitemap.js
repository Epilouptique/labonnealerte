// Sitemap XML genere a la volee : /sitemap.xml
//
// PERIMETRE PUBLIC UNIQUEMENT. On n'y met que ce qui est deja indexable et
// atteignable sans compte :
//   - les pages fixes du site ;
//   - une page statut par source ACTIVE (enabled = true) ;
//   - une page par collection OFFICIELLE (meme filtre que /api/collections
//     et que la route /collection/:slug : visibility='official' + pas de
//     proprietaire) ;
//   - les 5 categories du forum et les sujets NON MASQUES (hidden = false),
//     exactement le perimetre public du badge @slug et de /le-point.
//
// VOLONTAIREMENT ABSENTS :
//   - /u/:pseudo (deja en noindex), /favoris (redirection), /mes-decks,
//     /connexion, /offline.html ;
//   - /deck/:token — un token de partage publie dans un sitemap public rend le
//     deck indexable et detruit la nature du « lien non liste ». Decision a
//     prendre explicitement ; par defaut on n'inclut pas.
//
// Requetes : volontairement minimales (ids/slugs seuls). Les chargements
// existants (/api/sources, /api/collections, les listes forum) ramenent les
// payloads complets d'affichage — inutiles ici et bien plus lourds ; les
// FILTRES, eux, sont repris a l'identique.

const express = require('express');
const { pool } = require('./../db');

const router = express.Router();

// URL canonique = l'apex (www redirige en 301).
const ORIGIN = 'https://labonnealerte.fr';

// Categories du forum (meme liste que routes/forum.js, source unique).
const { CATEGORIES } = require('./forum');

const STATIC_PATHS = [
  '/',
  '/le-point',
  '/forum',
  '/a-propos',
  '/soutenir',
  '/mentions-legales',
  '/confidentialite',
  '/proposer',
  '/boutique',
];

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// encodeURI sur le chemin puis echappement XML : les ids/slugs sont deja
// contraints a [a-z0-9-] cote base, c'est une ceinture de securite.
function urlEntry(pathname, lastmod) {
  const loc = escXml(ORIGIN + encodeURI(pathname));
  const mod = lastmod ? `<lastmod>${escXml(new Date(lastmod).toISOString().slice(0, 10))}</lastmod>` : '';
  return `<url><loc>${loc}</loc>${mod}</url>`;
}

router.get('/sitemap.xml', async (req, res) => {
  try {
    const [sources, collections, topics] = await Promise.all([
      pool.query('SELECT id FROM sources WHERE enabled = true ORDER BY id'),
      pool.query(`SELECT id FROM collections
                   WHERE visibility = 'official' AND owner_subscriber_id IS NULL
                   ORDER BY id`),
      pool.query(`SELECT slug, last_reply_at FROM forum_topics
                   WHERE hidden = false ORDER BY last_reply_at DESC`),
    ]);

    const urls = [];
    STATIC_PATHS.forEach((p) => urls.push(urlEntry(p)));
    sources.rows.forEach((r) => urls.push(urlEntry(`/source/${r.id}/statut`)));
    collections.rows.forEach((r) => urls.push(urlEntry(`/collection/${r.id}`)));
    Object.keys(CATEGORIES).forEach((c) => urls.push(urlEntry(`/forum/c/${c}`)));
    topics.rows.forEach((r) => urls.push(urlEntry(`/forum/t/${r.slug}`, r.last_reply_at)));

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') + '\n</urlset>\n';

    res.type('application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] Erreur /sitemap.xml :', err.message);
    res.status(503).type('text/plain').send('Service momentanément indisponible.');
  }
});

module.exports = router;
