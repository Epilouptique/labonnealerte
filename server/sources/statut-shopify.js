const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-shopify', serviceName: 'Shopify', statusHost: 'https://www.shopifystatus.com', url: 'https://www.shopifystatus.com' });
