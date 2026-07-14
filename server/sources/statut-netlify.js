// Source interne : panne majeure Netlify (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-netlify', serviceName: 'Netlify',
  statusHost: 'https://www.netlifystatus.com', url: 'https://www.netlifystatus.com',
});
