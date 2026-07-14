// Source interne : panne majeure Cloudflare (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-cloudflare', serviceName: 'Cloudflare',
  statusHost: 'https://www.cloudflarestatus.com', url: 'https://www.cloudflarestatus.com',
});
