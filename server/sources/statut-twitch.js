// Source interne : panne majeure Twitch (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-twitch', serviceName: 'Twitch',
  statusHost: 'https://status.twitch.tv', url: 'https://status.twitch.tv',
});
