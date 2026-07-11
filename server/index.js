require('dotenv').config();

const path = require('path');
const express = require('express');
const apiRouter = require('./routes/api');
const devRouter = require('./routes/dev');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Confiance au proxy Railway pour obtenir la vraie IP client (rate-limiting dev).
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static('public'));
app.use('/api', apiRouter);
app.use('/api', subscribeApiRouter);
app.use('/api/dev', devRouter);
// Page développeur « Proposer une source » (palette Veille de nuit).
app.get('/proposer', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'proposer.html'));
});
// Pages HTML (liens email) montées à la racine, après le static.
app.use('/', pagesRouter);

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  startPoller();
});
