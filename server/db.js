const { Pool } = require('pg');

// Pool PostgreSQL. La connexion n'est réellement tentée qu'à la première requête,
// donc l'absence de DB ne bloque pas le démarrage du serveur.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway impose le SSL sur ses connexions publiques ; le certificat est
  // auto-signé côté proxy d'où rejectUnauthorized: false.
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] Erreur inattendue du pool PostgreSQL :', err.message);
});

module.exports = { pool };
