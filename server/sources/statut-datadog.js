const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-datadog', serviceName: 'Datadog', statusHost: 'https://status.datadoghq.com', url: 'https://status.datadoghq.com' });
