// Source interne : panne majeure Vercel (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-vercel', serviceName: 'Vercel',
  statusHost: 'https://www.vercel-status.com', url: 'https://www.vercel-status.com',
});
