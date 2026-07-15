// Source interne : panne majeure Vimeo (standard Statuspage).
// NB : le host statut est www.vimeostatus.com (status.vimeo.com redirige en 301).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-vimeo', serviceName: 'Vimeo',
  statusHost: 'https://www.vimeostatus.com', url: 'https://www.vimeostatus.com',
});
