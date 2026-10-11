// scripts/org-admin.js — gestion des ORGANISATIONS, RÉSERVÉE À HUGO (acteur admin).
// Vérifie / refuse / suspend une organisation ; motif OBLIGATOIRE pour refus et suspension.
// Affiche le domaine de l'e-mail pour comparaison manuelle au domaine officiel de la mairie.
// Simulation par défaut ; --write pour appliquer. DATABASE_URL jamais affichée.
// (Chantier « Publier pour les mairies et com-com », LOT A — cf. source-lifecycle-admin.js.)
//
//   node scripts/org-admin.js --list-pending
//   node scripts/org-admin.js --id=12 --to=verified --write
//   node scripts/org-admin.js --id=12 --to=refused  --reason="Domaine e-mail non officiel" --write
//   node scripts/org-admin.js --id=12 --to=suspended --reason="Usage abusif" --write
'use strict';
require('dotenv').config();
const ol = require('../server/orgs/lib/org-lifecycle');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const WRITE = args.write === true;
const id = typeof args.id === 'string' ? args.id.trim() : (typeof args.id === 'number' ? String(args.id) : '');
const to = typeof args.to === 'string' ? args.to.trim() : '';
const reason = typeof args.reason === 'string' ? args.reason.slice(0, 280) : null;
// « refused » est une commande admin : techniquement pending → 'suspended' avec motif.
const target = to === 'refused' ? 'suspended' : to;

(async () => {
  const { pool } = require('../server/db');
  try {
    if (args['list-pending']) {
      const { rows } = await pool.query(
        `SELECT o.id, o.name, o.type, o.commune_insee, o.siren, o.email, o.justification,
                o.created_at, s.email AS requester_email
           FROM organizations o
           JOIN subscribers s ON s.id = o.requester_subscriber_id
          WHERE o.status = 'pending' ORDER BY o.created_at ASC`);
      console.log(`Organisations EN ATTENTE (${rows.length}) :`);
      rows.forEach((r) => {
        const ident = r.commune_insee ? `INSEE ${r.commune_insee}` : (r.siren ? `SIREN ${r.siren}` : '—');
        console.log(`\n• #${r.id} — « ${r.name} » [${r.type}] ${ident}`);
        console.log(`  e-mail pro : ${r.email || '—'} (domaine : ${ol.emailDomain(r.email) || '—'})`);
        console.log(`  demandeur  : ${r.requester_email || '—'} (domaine : ${ol.emailDomain(r.requester_email) || '—'})`);
        if (r.justification) console.log(`  justificatif : « ${r.justification} »`);
        console.log(`  déposée le : ${r.created_at.toISOString ? r.created_at.toISOString() : r.created_at}`);
      });
      console.log('\n⚠️ Comparez le domaine de l\'e-mail au domaine officiel de la structure avant de vérifier.');
      return;
    }

    if (!id || !to) {
      console.error('Usage :\n  --list-pending\n  --id=<n> --to=verified|refused|suspended [--reason="…"] [--write]\n  (refused/suspended : --reason OBLIGATOIRE)');
      process.exit(2);
    }
    if (!['verified', 'refused', 'suspended'].includes(to)) {
      console.error('--to doit valoir verified, refused ou suspended.'); process.exit(2);
    }
    const { rows } = await pool.query(
      `SELECT o.id, o.name, o.type, o.status, o.commune_insee, o.siren, o.email,
              s.email AS requester_email
         FROM organizations o JOIN subscribers s ON s.id = o.requester_subscriber_id
        WHERE o.id = $1`, [id]);
    if (!rows.length) { console.error(`Organisation introuvable : #${id}`); process.exit(2); }
    const o = rows[0];
    const ident = o.commune_insee ? `INSEE ${o.commune_insee}` : (o.siren ? `SIREN ${o.siren}` : '—');
    console.log(`MODE : ${WRITE ? 'ÉCRITURE' : 'SIMULATION'} — #${o.id} « ${o.name} » [${o.type} ${ident}] : ${o.status} → ${to}${to === 'refused' ? ' (suspended+motif)' : ''}`);
    console.log(`  e-mail pro : ${o.email || '—'} (domaine : ${ol.emailDomain(o.email) || '—'}) · demandeur : ${ol.emailDomain(o.requester_email) || '—'}`);

    if (!ol.canTransitionOrg(o.status, target, 'admin')) {
      console.error(`Transition interdite : ${o.status} → ${target} (admin).`); process.exit(1);
    }
    if (ol.transitionNeedsReason(target) && !reason) {
      console.error('Un motif (--reason) est requis pour un refus ou une suspension.'); process.exit(2);
    }
    if (!WRITE) { console.log('SIMULATION : aucune écriture. Ajoutez --write pour appliquer.'); return; }

    const upd = await pool.query(
      `UPDATE organizations
          SET status = $2, status_reason = $3,
              verified_by = CASE WHEN $2 = 'verified' THEN 'admin' ELSE verified_by END,
              verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE verified_at END,
              updated_at = NOW()
        WHERE id = $1 AND status = $4
        RETURNING id, status, status_reason`,
      [id, target, target === 'verified' ? null : reason, o.status]);
    if (!upd.rows.length) { console.error('Aucune ligne modifiée (statut changé entre-temps ?).'); process.exit(1); }
    console.log('✅ Appliqué :', JSON.stringify(upd.rows[0]));
  } catch (e) {
    console.error('Erreur :', e.message); process.exitCode = 1;
  } finally { await pool.end(); }
})();
