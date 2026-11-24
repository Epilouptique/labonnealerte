// scripts/calendrier-upcoming-run.js — JETABLE. upcoming() réel des 2 sources calendaires
// sur 90 jours, pour vérifier les dates à l'œil. Aucune base, aucun poller.
'use strict';
const grandes = require('../server/sources/grandes-causes.js');
const caf = require('../server/sources/versement-prestations-caf.js');
const now = new Date();
const fmt = (d) => d.toISOString().slice(0, 16).replace('T', ' ');

for (const [name, src] of [['grandes-causes', grandes], ['versement-prestations-caf', caf]]) {
  console.log(`\n[${name}] upcoming(now, 90) — now = ${fmt(now)}`);
  const evs = src.upcoming(now, 90);
  if (!evs.length) { console.log('  (aucun événement dans les 90 prochains jours)'); continue; }
  evs.forEach((e) => console.log(`  ${fmt(e.start)} → ${fmt(e.end)} | ${e.message}`));
}
console.log('\nÉtat instantané check() :');
for (const [name, src] of [['grandes-causes', grandes], ['versement-prestations-caf', caf]]) {
  Promise.resolve(src.check()).then((r) => console.log(`  [${name}] state=${r.state}${r.message ? ' — ' + r.message : ''}`));
}
