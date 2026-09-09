// Applique le schéma server/db/init.sql sur la base pointée par DATABASE_URL.
// Usage : node server/db/migrate.js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const sqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // MIGRATION ATOMIQUE. Sans transaction, une erreur au milieu d'init.sql laissait
  // la base a MI-CHEMIN : les instructions deja passees restaient appliquees, les
  // suivantes non, et rien ne disait ou la coupure avait eu lieu. On enveloppe donc
  // le tout : soit le schema entier est en place, soit la base n'a pas bouge.
  //
  // Verifie avant d'envelopper : init.sql ne contient AUCUNE instruction refusant de
  // tourner dans une transaction (pas de CREATE INDEX CONCURRENTLY, pas de VACUUM,
  // pas de CREATE DATABASE). Si l'une venait a y etre ajoutee, elle echouerait avec
  // « cannot run inside a transaction block » -- et il faudrait alors la sortir d'ici
  // plutot que de retirer la transaction.
  //
  // UN SEUL CLIENT, pas pool.query : BEGIN, le corps et COMMIT doivent voyager sur la
  // MEME connexion. Passes au pool, ils pourraient etre servis par trois connexions
  // differentes, et le BEGIN ne couvrirait alors rien du tout.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Table historique de l'ère mono-promo : supprimée au profit du modèle multi-sources.
    await client.query('DROP TABLE IF EXISTS promo_status');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration OK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration échouée (aucune modification appliquée) :', err.message, err.code);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
