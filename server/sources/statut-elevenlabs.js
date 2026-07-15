const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-elevenlabs', serviceName: 'ElevenLabs', statusHost: 'https://status.elevenlabs.io', url: 'https://status.elevenlabs.io' });
