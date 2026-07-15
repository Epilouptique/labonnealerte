// Source interne : panne majeure Linear (standard Statuspage).
// status.linear.app redirige (301) vers linearstatus.com, qui expose le JSON
// Statuspage : on pointe DIRECTEMENT sur linearstatus.com pour éviter la redirection.
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-linear', serviceName: 'Linear',
  statusHost: 'https://linearstatus.com', url: 'https://linearstatus.com',
});
