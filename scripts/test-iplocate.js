/* test-iplocate.js — TEST ISOLÉ, hors flux applicatif (NON branché sur profile-autofill).
 *
 * Compare, pour une liste d'IP, la localisation renvoyée par geoip-lite (actuel) et par
 * IPLocate.io (piste évaluée). But : juger si IPLocate est assez fiable pour un
 * pré-remplissage département — et surtout s'il expose un champ de confiance/précision
 * (équivalent du `area` de geoip) permettant de rejouer un garde-fou. Réponse observée :
 * NON, IPLocate free n'a pas de champ de précision.
 *
 * Usage :
 *   node scripts/test-iplocate.js                 # liste d'IP de test par défaut
 *   node scripts/test-iplocate.js 1.2.3.4 5.6.7.8 # IP fournies (ex. ta vraie IP de Gap)
 *   node scripts/test-iplocate.js 2a01:e34:abcd:1234::1  # IPv6 (adresse COMPLETE d'abonné,
 *                                                        # PAS une base de préfixe ::1 qui
 *                                                        # renvoie le siège du FAI)
 *   IPLOCATE_APIKEY=xxxx node scripts/test-iplocate.js   # avec clé (quota 1000/j)
 *
 * Sans clé : IPLocate autorise un petit quota keyless (suffisant pour quelques essais).
 * geoip-lite ET IPLocate acceptent l'IPv4 comme l'IPv6.
 */

const https = require('https');
const geoip = require('geoip-lite');

const KEY = process.env.IPLOCATE_APIKEY || '';
const DEFAULT_IPS = [
  '78.192.10.10', '31.32.1.1', '82.64.10.10', '62.34.200.200',
  '193.248.200.200', '46.193.10.10', '5.49.50.50', '2.7.1.1',
];

function iplocate(ip) {
  const url = 'https://iplocate.io/api/lookup/' + encodeURIComponent(ip) +
    (KEY ? '?apikey=' + encodeURIComponent(KEY) : '');
  return new Promise((resolve) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ error: d.slice(0, 120) }); } });
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const ips = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IPS;
  console.log('IP'.padEnd(17), '| geoip-lite (city, area km)'.padEnd(30), '| IPLocate (city / subdivision / postal / lat,lon)');
  for (const ip of ips) {
    const g = geoip.lookup(ip);
    const gTxt = g ? `${g.country}/${g.city || '(vide)'} (a${g.area})` : '(inconnu)';
    const l = await iplocate(ip);
    if (l.error) { console.log(ip.padEnd(17), '| ' + gTxt.padEnd(28), '| ERREUR: ' + l.error); }
    else {
      console.log(ip.padEnd(17), '| ' + gTxt.padEnd(28),
        `| ${l.city} / ${l.subdivision} / ${l.postal_code}  [${l.latitude},${l.longitude}]`);
    }
    await new Promise((r) => setTimeout(r, 400)); // douceur sur le quota
  }
  // Rappel : IPLocate n'expose PAS de rayon de précision → pas de garde-fou possible
  // équivalent au seuil area<=50km utilisé (puis abandonné) avec geoip-lite.
})();
