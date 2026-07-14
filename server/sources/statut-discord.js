// Source interne : panne majeure Discord (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-discord', serviceName: 'Discord',
  statusHost: 'https://discordstatus.com', url: 'https://discordstatus.com',
});
