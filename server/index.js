require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { pool } = require('./db');
const apiRouter = require('./routes/api');
const devRouter = require('./routes/dev');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { apiRouter: myAlertsApiRouter, pagesRouter: myAlertsPagesRouter } = require('./routes/myalerts');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Confiance au proxy Railway pour obtenir la vraie IP client (rate-limiting dev).
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static('public'));
app.use('/api', apiRouter);
app.use('/api', subscribeApiRouter);
app.use('/api', myAlertsApiRouter);
app.use('/api/dev', devRouter);
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

// Page de statut d'une source : SEO injecté côté serveur + 404 propre.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
app.get('/source/:id/statut', async (req, res) => {
  const id = req.params.id;
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
  startPoller();
});
