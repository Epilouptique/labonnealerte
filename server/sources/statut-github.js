// Source interne : panne majeure GitHub (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-github', serviceName: 'GitHub',
  statusHost: 'https://www.githubstatus.com', url: 'https://www.githubstatus.com',
});
