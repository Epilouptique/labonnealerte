// scripts/cleanup-mairie-test.js — nettoyage d'une organisation de TEST et de ses données.
// Supprime, pour une organisation donnée : ses événements, le journal de diffusion de ces
// événements, ses membres, puis l'organisation. SIMULATION par défaut ; --write pour exécuter.
// UNE requête à la fois (ordre sûr vis-à-vis des clés étrangères). DATABASE_URL jamais affichée.
// Garde-fou : refuse d'agir sur une organisation « verified » dont le nom ne contient pas
// « test », sauf --force (évite toute suppression accidentelle d'une vraie collectivité).
//
//   node scripts/cleanup-mairie-test.js --org=<id>            (simulation)
//   node scripts/cleanup-mairie-test.js --org=<id> --write     (exécution)
'use strict';
require('dotenv').config();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const WRITE = args.write === true;
const FORCE = args.force === true;
const orgId = parseInt(args.org, 10);

(async () => {
  const { pool } = require('../server/db');
  try {
    if (!Number.isInteger(orgId)) { console.error('Usage : --org=<id> [--write] [--force]'); process.exit(2); }
    const o = await pool.query('SELECT id, name, type, commune_insee, status FROM organizations WHERE id = $1', [orgId]);
    if (!o.rows.length) { console.error(`Organisation #${orgId} introuvable.`); process.exit(2); }
    const org = o.rows[0];
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log(`Cible : #${org.id} « ${org.name} » [${org.type} ${org.commune_insee || ''}] statut=${org.status}`);

    // Garde-fou anti-bévue.
    if (!/test/i.test(org.name) && !FORCE) {
      console.error('⛔ Le nom ne contient pas « test ». Ajoutez --force si c\'est bien l\'organisation de test à supprimer.');
      process.exit(1);
    }

    // Décompte (lecture seule), une requête à la fois.
    const ev = await pool.query('SELECT COUNT(*)::int n FROM municipal_events WHERE org_id = $1', [orgId]);
    const nj = await pool.query(
      'SELECT COUNT(*)::int n FROM municipal_event_notifications mn JOIN municipal_events e ON e.id = mn.event_id WHERE e.org_id = $1', [orgId]);
    const nm = await pool.query('SELECT COUNT(*)::int n FROM organization_members WHERE org_id = $1', [orgId]);
    console.log(`À supprimer : ${ev.rows[0].n} événement(s), ${nj.rows[0].n} ligne(s) de journal, ${nm.rows[0].n} membre(s), 1 organisation.`);

    if (!WRITE) {
      console.log('\nSIMULATION : aucune suppression. Relancez avec --write pour exécuter (après accord de Hugo).');
      return;
    }

    // Suppressions, une requête à la fois, dans l'ordre des dépendances.
    let r;
    r = await pool.query(
      'DELETE FROM municipal_event_notifications WHERE event_id IN (SELECT id FROM municipal_events WHERE org_id = $1)', [orgId]);
    console.log(`1/4 journal supprimé : ${r.rowCount}`);
    r = await pool.query('DELETE FROM municipal_events WHERE org_id = $1', [orgId]);
    console.log(`2/4 événements supprimés : ${r.rowCount}`);
    r = await pool.query('DELETE FROM organization_members WHERE org_id = $1', [orgId]);
    console.log(`3/4 membres supprimés : ${r.rowCount}`);
    r = await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    console.log(`4/4 organisation supprimée : ${r.rowCount}`);
    console.log('✅ Nettoyage terminé.');
  } catch (e) {
    console.error('Erreur :', e.message); process.exitCode = 1;
  } finally { await pool.end(); }
})();
