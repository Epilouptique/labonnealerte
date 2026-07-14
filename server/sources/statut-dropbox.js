// Source interne : panne majeure Dropbox (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-dropbox', serviceName: 'Dropbox',
  statusHost: 'https://status.dropbox.com', url: 'https://status.dropbox.com',
});
