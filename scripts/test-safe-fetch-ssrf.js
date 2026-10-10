// scripts/test-safe-fetch-ssrf.js — LOT 1 durcissement SSRF (logique pure, HORS réseau).
// Couvre : adresses internes/réservées (IPv4+IPv6, mapped/6to4/NAT64), rebinding simulé
// (lookup épinglé rejette une IP interne), refus de redirection (classifieur), bombe de
// décompression (gzip > limite), robots.txt interdit. Aucun socket réel.
// Lancer : node scripts/test-safe-fetch-ssrf.js
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const sf = require('../server/safe-fetch');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

(async () => {
  console.log('TEST durcissement SSRF (safe-fetch)');

  // 1) IPv4 internes / réservées → bloquées
  for (const ip of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1',
    '169.254.169.254', '172.16.5.5', '192.0.0.1', '192.0.2.5', '192.168.1.1',
    '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) {
    ok(sf.isPrivateIP(ip) === true, `IPv4 bloquée : ${ip}`);
  }
  // IPv4 publiques → autorisées
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '100.63.255.255', '100.128.0.1']) {
    ok(sf.isPrivateIP(ip) === false, `IPv4 publique autorisée : ${ip}`);
  }

  // 2) IPv6 internes / réservées / encapsulées → bloquées
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '2001:db8::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '2002:0a00:0001::', /* 6to4 de 10.0.0.1 */ '64:ff9b::7f00:1' /* NAT64 127.0.0.1 */]) {
    ok(sf.isPrivateIP(ip) === true, `IPv6 bloquée : ${ip}`);
  }
  // IPv6 publiques / IPv4 publique mappée → autorisées
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    ok(sf.isPrivateIP(ip) === false, `IPv6 publique autorisée : ${ip}`);
  }

  // 3) Rebinding simulé : le lookup épinglé reçoit la réponse DNS et DOIT rejeter une IP interne.
  const callLookup = (resolverAddrs) => new Promise((resolve) => {
    const resolver = (host, cb) => cb(null, resolverAddrs);
    sf.makeGuardedLookup(resolver)('exemple.test', {}, (err, addr, fam) => resolve({ err, addr, fam }));
  });
  let r = await callLookup([{ address: '169.254.169.254', family: 4 }]); // metadata cloud
  ok(r.err && r.err.public, 'rebinding : IP interne (metadata) rejetée par le lookup');
  r = await callLookup([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]);
  ok(r.err && r.err.public, 'rebinding : jeu public+interne rejeté en entier (strict)');
  r = await callLookup([{ address: '93.184.216.34', family: 4 }]);
  ok(!r.err && r.addr === '93.184.216.34' && r.fam === 4, 'lookup : IP publique transmise au socket (épinglée)');
  r = await callLookup([{ address: '2606:4700:4700::1111', family: 6 }]);
  ok(!r.err && r.fam === 6, 'lookup : IPv6 publique transmise (famille 6)');

  // 4) Refus de redirection (représente « redirection vers IP privée » : on refuse TOUT 3xx).
  ok(sf.isRedirect(301) && sf.isRedirect(302) && sf.isRedirect(307) && sf.isRedirect(308), 'les 3xx sont classés redirection (refusés)');
  ok(!sf.isRedirect(200) && !sf.isRedirect(404), 'les 2xx/4xx ne sont pas des redirections');

  // 5) Bombe de décompression : gzip qui dépasse la limite après décompression → throw public.
  const big = Buffer.alloc(2 * 1024 * 1024, 0x61); // 2 Mo de 'a' → gzip minuscule
  const gz = zlib.gzipSync(big);
  ok(gz.length < 64 * 1024, 'le gzip de 2 Mo est bien petit (bombe potentielle)');
  let threw = false;
  try { sf.decodeBody(gz, 'gzip', 100 * 1024); } catch (e) { threw = e && e.public && /volumineuse/i.test(e.message); }
  ok(threw, 'gzip décompressé > limite → refusé (anti-bombe)');
  // gzip sous la limite → OK, contenu intact
  const small = Buffer.from('bonjour'); const gzs = zlib.gzipSync(small);
  ok(sf.decodeBody(gzs, 'gzip', 100 * 1024).toString('utf8') === 'bonjour', 'gzip sous la limite → décodé correctement');
  // identity passthrough
  ok(sf.decodeBody(Buffer.from('xyz'), '', 1024).toString('utf8') === 'xyz', 'identity → corps inchangé');
  // brotli sous la limite
  ok(sf.decodeBody(zlib.brotliCompressSync(small), 'br', 100 * 1024).toString('utf8') === 'bonjour', 'brotli sous la limite → décodé');

  // 6) robots.txt
  const robots = [
    'User-agent: *',
    'Disallow: /private',
    'Allow: /private/public',
    '',
    'User-agent: LaBonneAlerte',
    'Disallow: /secret',
  ].join('\n');
  ok(sf.robotsDisallows(robots, '/secret/x', 'LaBonneAlerte') === true, 'robots : groupe spécifique LaBonneAlerte interdit /secret');
  ok(sf.robotsDisallows(robots, '/private/x', 'LaBonneAlerte') === false, 'robots : groupe spécifique ne reprend pas les règles de * (pas de /private)');
  ok(sf.robotsDisallows(robots, '/private/page', 'AutreBot') === true, 'robots : groupe * interdit /private');
  ok(sf.robotsDisallows(robots, '/private/public/x', 'AutreBot') === false, 'robots : Allow plus long l\'emporte sur Disallow');
  ok(sf.robotsDisallows(robots, '/ouvert', 'AutreBot') === false, 'robots : chemin non listé → autorisé');
  ok(sf.robotsDisallows('User-agent: *\nDisallow:', '/quoi', '*') === false, 'robots : Disallow vide → tout autorisé');
  ok(sf.robotsDisallows('', '/x', '*') === false, 'robots : fichier vide → autorisé');
  ok(sf.robotsDisallows('User-agent: *\nDisallow: /', '/x', '*') === true, 'robots : Disallow / → tout interdit');

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
