// Source interne : panne Railway (format Instatus, différent de Statuspage).
const { createInstatusSource } = require('./lib/statuspage-factory');

module.exports = createInstatusSource({
  id: 'statut-railway', serviceName: 'Railway',
  statusHost: 'https://railway.instatus.com', url: 'https://status.railway.com',
});
