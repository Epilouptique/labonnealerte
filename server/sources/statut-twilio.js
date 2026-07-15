// Source interne : panne majeure Twilio (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-twilio', serviceName: 'Twilio',
  statusHost: 'https://status.twilio.com', url: 'https://status.twilio.com',
});
