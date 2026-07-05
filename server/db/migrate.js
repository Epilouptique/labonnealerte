// Applique le schéma server/db/init.sql sur la base pointée par DATABASE_URL.
// Usage : node server/db/migrate.js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const sqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('Migration OK');
  } catch (err) {
    console.error('Migration échouée :', err.message, err.code);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
