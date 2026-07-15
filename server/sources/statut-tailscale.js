const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-tailscale', serviceName: 'Tailscale', statusHost: 'https://status.tailscale.com', url: 'https://status.tailscale.com' });
