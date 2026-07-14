// Source interne : panne majeure Figma (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-figma', serviceName: 'Figma',
  statusHost: 'https://status.figma.com', url: 'https://status.figma.com',
});
