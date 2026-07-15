// Source interne : panne majeure DigitalOcean (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-digitalocean', serviceName: 'DigitalOcean',
  statusHost: 'https://status.digitalocean.com', url: 'https://status.digitalocean.com',
});
