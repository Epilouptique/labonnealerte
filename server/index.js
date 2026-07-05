require('dotenv').config();

const express = require('express');
const apiRouter = require('./routes/api');
const { startCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.json({ service: 'labonnealerte', status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  startCron();
});
