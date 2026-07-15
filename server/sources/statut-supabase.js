// Source interne : panne majeure Supabase (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-supabase', serviceName: 'Supabase',
  statusHost: 'https://status.supabase.com', url: 'https://status.supabase.com',
});
