require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');
const apiRouter = require('./routes/api');
const devRouter = require('./routes/dev');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { apiRouter: myAlertsApiRouter, pagesRouter: myAlertsPagesRouter } = require('./routes/myalerts');
const authRouter = require('./routes/auth');
const pushRouter = require('./routes/push');
const { cleanupExpired } = require('./sessions');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Un seul proxy devant l'app (Railway) : indispensable pour l'IP réelle du client
// (rate-limiting) sans permettre l'usurpation via X-Forwarded-For.
app.set('trust proxy', 1);
// Désactivé aussi explicitement via helmet (X-Powered-By).
app.disable('x-powered-by');

// B) En-têtes de sécurité + Content-Security-Policy adaptée au site.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // Polices auto-hébergées (RGPD, aucune requête vers Google) : /css/fonts.css
      // + /fonts/*.woff2. 'unsafe-inline' pour les attributs style= et blocs <style>.
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'"],
      'script-src': ["'self'"], // aucun script inline (tous externalisés)
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      // PWA : service worker et manifeste, même origine.
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
    },
  },
}));

app.use(express.json());

// PWA — servis explicitement AVANT le static pour maîtriser les en-têtes.
const publicDir = path.join(__dirname, '..', 'public');
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(publicDir, 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.type('application/javascript');
  // Autorise un scope racine et force la revalidation (mises à jour du SW).
  res.set('Service-Worker-Allowed', '/');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'sw.js'));
});

app.use(express.static('public'));

// C) Limiteur global sur /api : 120 requêtes/minute/IP (la home fait plusieurs appels).
//    Les limiteurs stricts (subscribe, my-alerts, dev) restent actifs en plus.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
});
app.use('/api', apiLimiter);

app.use('/api', apiRouter);
app.use('/api', subscribeApiRouter);
app.use('/api', myAlertsApiRouter);
app.use('/api', pushRouter);
app.use('/api/dev', devRouter);
// Connexion OAuth (Google / GitHub) — redirections serveur.
app.use('/auth', authRouter);
// Page développeur « Proposer une source » (palette Veille de nuit).
app.get('/proposer', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'proposer.html'));
});
// Pages statiques simples.
app.get('/a-propos', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'a-propos.html'));
});
app.get('/soutenir', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'soutenir.html'));
});
app.get('/mentions-legales', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mentions-legales.html'));
});
app.get('/confidentialite', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'confidentialite.html'));
});

// Fusion v2 (vague 12) : anciens ids broadcast → source paramétrée (qs = query
// string vers la combinaison équivalente ; vide = page source sans préréglage).
const FUSED_REDIRECTS = {
  'vigieau-gap': { to: 'vigieau', qs: 'commune=05061' },
  'vacances-zone-a': { to: 'vacances-scolaires', qs: 'zone=A' },
  'vacances-zone-b': { to: 'vacances-scolaires', qs: 'zone=B' },
  'vacances-zone-c': { to: 'vacances-scolaires', qs: 'zone=C' },
  'carburant-seuils': { to: 'carburant', qs: '' },
};

// Page de statut d'une source : SEO injecté côté serveur + 404 propre.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
app.get('/source/:id/statut', async (req, res) => {
  const id = req.params.id;
  // Fusion v2 : anciennes vigilances départementales → page paramétrée (SEO 301).
  const oldVig = id.match(/^vigilance-meteo-(.+)$/);
  if (oldVig) {
    return res.redirect(301, '/source/vigilance-meteo/statut?departement=' + encodeURIComponent(oldVig[1]));
  }
  // Fusion v2 (vague 12) : sources broadcast retirées → source paramétrée (SEO 301).
  const fused = FUSED_REDIRECTS[id];
  if (fused) {
    return res.redirect(301, `/source/${fused.to}/statut${fused.qs ? '?' + fused.qs : ''}`);
  }
  try {
    const { rows } = await pool.query(
      'SELECT name, subtitle, description FROM sources WHERE id = $1 AND enabled = true',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Source introuvable</title>' +
        '<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;text-align:center;color:#0f1419">' +
        '<h1>Source introuvable</h1><p>Cette source n\'existe pas ou n\'est plus disponible.</p>' +
        '<p><a href="/" style="color:#a567e3;font-weight:600">← Retour au kiosque</a></p></body>'
      );
    }
    const s = rows[0];
    const title = `${s.name} — statut & historique · La Bonne Alerte`;
    const desc = (s.subtitle || s.description || `Statut de surveillance de « ${s.name} ».`).slice(0, 180);
    const url = `https://www.labonnealerte.fr/source/${encodeURIComponent(id)}/statut`;

    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'source.html'), 'utf8');
    html = html
      .replace(/\{\{TITLE\}\}/g, escHtml(title))
      .replace(/\{\{DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_TITLE\}\}/g, escHtml(s.name + ' — statut'))
      .replace(/\{\{OG_DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_URL\}\}/g, escHtml(url));
    res.type('html').send(html);
  } catch (err) {
    console.error('[server] Erreur /source/:id/statut :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});
// Pages HTML (liens email) montées à la racine, après le static.
app.use('/', pagesRouter);
app.use('/', myAlertsPagesRouter);

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  cleanupExpired(); // purge des sessions expirées au démarrage
  startPoller();
});
