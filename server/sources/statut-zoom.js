// Source interne : panne majeure Zoom (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-zoom', serviceName: 'Zoom',
  statusHost: 'https://status.zoom.us', url: 'https://status.zoom.us',
});
