// Source interne : panne majeure Proton (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-proton', serviceName: 'Proton',
  statusHost: 'https://status.proton.me', url: 'https://status.proton.me',
});
