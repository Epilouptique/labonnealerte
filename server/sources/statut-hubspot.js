const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-hubspot', serviceName: 'HubSpot', statusHost: 'https://status.hubspot.com', url: 'https://status.hubspot.com' });
