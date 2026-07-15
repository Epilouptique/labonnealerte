const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-render', serviceName: 'Render', statusHost: 'https://status.render.com', url: 'https://status.render.com' });
