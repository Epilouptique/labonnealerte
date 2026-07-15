// Source interne : panne majeure Brevo (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-brevo', serviceName: 'Brevo',
  statusHost: 'https://status.brevo.com', url: 'https://status.brevo.com',
});
