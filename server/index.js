require('dotenv').config();

const express = require('express');
const apiRouter = require('./routes/api');
const subscribeRouter = require('./routes/subscribe');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRouter);
app.use('/api', subscribeRouter);

app.get('/', (req, res) => {
  res.json({ service: 'labonnealerte', status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  startPoller();
});
