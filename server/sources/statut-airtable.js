// Source interne : panne majeure Airtable (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-airtable', serviceName: 'Airtable',
  statusHost: 'https://status.airtable.com', url: 'https://status.airtable.com',
});
