const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-flyio', serviceName: 'Fly.io', statusHost: 'https://status.flyio.net', url: 'https://status.flyio.net' });
