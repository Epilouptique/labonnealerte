const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-grafana', serviceName: 'Grafana Cloud', statusHost: 'https://status.grafana.com', url: 'https://status.grafana.com' });
