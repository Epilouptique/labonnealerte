// scripts/test-canonical-host.js
// Teste la redirection canonique www → apex (server/canonical-host.js) sur un
// serveur express ISOLE : aucune base, aucun poller, aucun appel reseau sortant.
// Usage : node scripts/test-canonical-host.js
const express = require('express');
const http = require('http');
const { createCanonicalHostRedirect } = require('../server/canonical-host');

const APEX = 'labonnealerte.fr';

function request(port, pathAndQuery, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathAndQuery, method: 'GET', headers: { Host: hostHeader } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location || null });
      });
    req.on('error', reject);
    req.end();
  });
}

const CASES = [
  // [hote envoye, chemin demande, status attendu, Location attendue]
  ['www.' + APEX, '/', 301, 'https://' + APEX + '/'],
  ['www.' + APEX, '/?token=ABC123', 301, 'https://' + APEX + '/?token=ABC123'],
  ['www.' + APEX, '/source/statut-railway/statut', 301, 'https://' + APEX + '/source/statut-railway/statut'],
  ['WWW.' + APEX.toUpperCase(), '/', 301, 'https://' + APEX + '/'],
  ['www.' + APEX + ':8080', '/', 301, 'https://' + APEX + '/'],
  // Hotes qui NE doivent PAS etre rediriges (sinon boucle ou casse) :
  [APEX, '/', 200, null],
  ['00g8q71e.up.railway.app', '/', 200, null],
  ['localhost', '/', 200, null],
  ['wwwlabonnealerte.fr', '/', 200, null],
  ['evil-www.' + APEX + '.attacker.test', '/', 200, null],
];

(async () => {
  const app = express();
  app.use(createCanonicalHostRedirect(APEX));
  // express 5 : pas de joker '*' en chemin de route → middleware attrape-tout.
  app.use((req, res) => res.status(200).send('ok'));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;

  let ko = 0;
  for (const [host, pathQ, wantStatus, wantLoc] of CASES) {
    const got = await request(port, pathQ, host);
    const okStatus = got.status === wantStatus;
    const okLoc = (wantLoc === null) ? true : got.location === wantLoc;
    const ok = okStatus && okLoc;
    if (!ok) ko++;
    console.log((ok ? 'OK  ' : 'KO  ') + host.padEnd(38) + pathQ.padEnd(34) +
      '-> ' + got.status + (got.location ? ' ' + got.location : ''));
    if (!ok) console.log('      attendu : ' + wantStatus + (wantLoc ? ' ' + wantLoc : ''));
  }

  // Desactivation explicite : CANONICAL_HOST='' ne doit produire aucun middleware.
  const off = createCanonicalHostRedirect('');
  const okOff = off === null;
  if (!okOff) ko++;
  console.log((okOff ? 'OK  ' : 'KO  ') + "CANONICAL_HOST='' -> middleware desactive");

  server.close();
  console.log('\n' + (ko === 0 ? 'TOUS LES CAS PASSENT' : ko + ' CAS EN ECHEC'));
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(1); });
