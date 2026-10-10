// scripts/net-verify-ssrf.js — VÉRIFICATION RÉSEAU LOCALE (lecture seule) du lot 1-bis.
// Pour des URLs RÉELLES et variées (HTML PanneauPocket, binaire Météo-France, JSON, RSS,
// agenda iCal), interroge successivement :
//   (1) UNDICI + Agent allowH2:true + connect.lookup épinglé  → le NOUVEAU transport ;
//   (2) fetch global de Node (undici interne)                 → comportement de c026224 ;
//   (3) https natif (HTTP/1.1)                                 → la CAUSE de la régression lot 1.
// Affiche statut, octets, IP résolue (publique ?), durée. AUCUN accès base, AUCUNE écriture,
// AUCUNE notification. Réseau sortant uniquement. Lancer : node scripts/net-verify-ssrf.js
'use strict';
const dns = require('dns').promises;
const https = require('https');
const { fetch: uFetch, Agent } = require('C:/Dev/Labonnealerte/node_modules/undici');
const { isPrivateIP, makeGuardedLookup } = require('../server/safe-fetch');

const TIMEOUT = 9000;
const CAP = 256 * 1024;

const URLS = [
  { id: 'panneaupocket (HTML)', url: 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000' },
  { id: 'ma-collectivite (HTML, même hôte)', url: 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000' },
  { id: 'meteo-forets (binaire .gz)', url: 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF/mdf_2026.csv.gz' },
  { id: 'statut-cloudflare (JSON)', url: 'https://www.cloudflarestatus.com/api/v2/status.json' },
  { id: 'service-public (RSS)', url: 'https://www.service-public.gouv.fr/abonnements/rss/actu-actualites-particuliers.rss' },
  { id: 'rappel-conso (HTML)', url: 'https://rappel.conso.gouv.fr/' },
  { id: 'jours fériés FR (agenda iCal)', url: 'https://calendar.google.com/calendar/ical/fr.french%23holiday%40group.v.calendar.google.com/public/basic.ics' },
];

const guardedAgent = new Agent({ allowH2: true, connect: { lookup: makeGuardedLookup() } });

async function resolveIp(host) {
  try {
    const a = await dns.lookup(host, { all: true });
    const ip = a[0] && a[0].address;
    return { ip, public: ip ? !isPrivateIP(ip) : false };
  } catch (e) { return { ip: null, public: false }; }
}

async function readCapped(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return 0;
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > CAP) { try { await reader.cancel(); } catch (e) {} break; }
  }
  return size;
}

async function viaFetch(fn, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  const t0 = Date.now();
  try {
    const res = await fn(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'LaBonneAlerte/1.0 (+https://labonnealerte.fr/a-propos)' } });
    const bytes = (res.status >= 200 && res.status < 300) ? await readCapped(res) : 0;
    return { status: String(res.status), bytes, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 'ERR:' + ((e && (e.cause && e.cause.code || e.code || e.message)) || 'x'), bytes: 0, ms: Date.now() - t0 };
  } finally { clearTimeout(t); }
}

function viaHttps(url) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.request(url, { method: 'GET' }, (res) => {
      let size = 0; res.on('data', (c) => { size += c.length; if (size > CAP) res.destroy(); });
      res.on('end', () => resolve({ status: String(res.statusCode), bytes: size, ms: Date.now() - t0 }));
      res.on('error', () => resolve({ status: 'ERR:read', bytes: 0, ms: Date.now() - t0 }));
    });
    req.setTimeout(TIMEOUT, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 'ERR:' + (e.code || e.message), bytes: 0, ms: Date.now() - t0 }));
    req.end();
  });
}

(async () => {
  console.log('VÉRIF RÉSEAU lot 1-bis (lecture seule) — timeout ' + TIMEOUT + 'ms, lecture plafonnée ' + (CAP / 1024) + ' Ko\n');
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(pad('source', 34) + pad('IP (publique?)', 20) + pad('undici+h2+lookup', 20) + pad('fetch global (c026224)', 24) + 'https natif (h1)');
  console.log('-'.repeat(118));
  for (const u of URLS) {
    const host = new URL(u.url).hostname;
    const ipi = await resolveIp(host);
    const nu = await viaFetch((url, o) => uFetch(url, Object.assign({ dispatcher: guardedAgent }, o)), u.url);
    const og = await viaFetch((url, o) => fetch(url, o), u.url);
    const h1 = await viaHttps(u.url);
    const fmt = (r) => `${r.status} ${r.bytes}o ${r.ms}ms`;
    console.log(pad(u.id, 34) + pad((ipi.ip || '?') + (ipi.public ? ' ✓' : ' ✗'), 20) + pad(fmt(nu), 20) + pad(fmt(og), 24) + fmt(h1));
  }
  console.log('\nLecture : « undici+h2+lookup » = nouveau transport ; « fetch global » = c026224 ; « https natif » = lot 1 (régression).');
  console.log('Aucune base touchée, aucune écriture, aucune notification.');
  await guardedAgent.close().catch(() => {});
})();
