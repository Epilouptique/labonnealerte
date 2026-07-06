require('dotenv').config();

const express = require('express');
const apiRouter = require('./routes/api');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/api', apiRouter);
app.use('/api', subscribeApiRouter);
// Pages HTML (liens email) montées à la racine, après le static.
app.use('/', pagesRouter);

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  startPoller();
});
