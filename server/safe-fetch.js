// Récupération HTTP sécurisée (anti-SSRF) partagée par le validateur /proposer
// et le poller des sources externes (external, veille-rss/page/agenda, panneaupocket).
//
// GARDE-FOUS (LOT 1 durcissement) :
//   - http/https uniquement ;
//   - rejet des IP privées/loopback/lien-local/ULA ET des plages réservées
//     (0/8, 100.64/10 CGNAT, 192.0.0/24, 198.18/15, TEST-NET, multicast, réservé,
//      IPv6 : ::1, ::, mapped-v4, 6to4, NAT64, ULA, lien-local, multicast, discard) ;
//   - ÉPINGLAGE DE L'IP : la validation DNS et la connexion utilisent la MÊME
//     adresse (option `lookup` custom passée au socket) → pas de fenêtre de
//     DNS-rebinding entre le contrôle et le connect ;
//   - redirections JAMAIS suivies (un 3xx = refus) ;
//   - taille plafonnée À LA LECTURE (flux compressé) ET APRÈS décompression
//     (gzip/deflate/br via zlib + maxOutputLength → anti-bombe de décompression) ;
//   - timeout court ; User-Agent identifiable avec URL de contact ;
//   - respect de robots.txt OPT-IN (opts.robots=true) pour les URLs soumises par
//     des utilisateurs ; JAMAIS pour les sources officielles (elles n'activent pas
//     le drapeau).

const dns = require('dns');
const dnsp = dns.promises;
const net = require('net');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 100 * 1024; // 100 Ko

// User-Agent identifiable + URL de contact (bonnes pratiques crawler).
const BOT_UA = 'LaBonneAlerte/1.0 (+https://labonnealerte.fr/a-propos)';
const BOT_TOKEN = 'LaBonneAlerte'; // jeton reconnu dans robots.txt

// User-Agent « navigateur » explicite : certains CDN coupent la connexion sur un
// UA robot/vide (constaté sur bouyguestelecom.fr lors de l'exploration FAI).
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Erreur « publique » : message sûr à renvoyer au client (rédigé par nous).
function pubErr(msg) { const e = new Error(msg); e.public = true; return e; }

/* ──────────────────────────────────────────────────────────────────────────
 * 1) Classification des adresses IP (IPv4 + IPv6)
 * ────────────────────────────────────────────────────────────────────────── */
function isBlockedIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  if (p[0] === 0) return true;                               // 0.0.0.0/8 "ce réseau"
  if (p[0] === 10) return true;                              // privé
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // 100.64/10 CGNAT
  if (p[0] === 127) return true;                             // loopback
  if (p[0] === 169 && p[1] === 254) return true;             // lien-local / metadata cloud
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // privé
  if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // 192.0.0/24 IETF
  if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true; // 192.0.2/24 TEST-NET-1
  if (p[0] === 192 && p[1] === 168) return true;             // privé
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // 198.18/15 benchmark
  if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;  // TEST-NET-2
  if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;   // TEST-NET-3
  if (p[0] >= 224) return true;                              // 224/4 multicast + 240/4 réservé + 255.255.255.255
  return false;
}

// Extrait un IPv4 encapsulé dans un IPv6 (mapped, 6to4, NAT64) → "a.b.c.d" ou null.
function embeddedIPv4(low) {
  const m = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // ::ffff:a.b.c.d (mapped)
  if (m) return m[1];
  const groups = low.split(':');
  // 6to4 : 2002:AABB:CCDD::/16 → AA.BB.CC.DD
  if (groups[0] === '2002' && groups[1] && groups[2]) {
    const h = (groups[1] + groups[2].padStart(4, '0')).padStart(8, '0').slice(0, 8);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)].join('.');
  }
  // NAT64 : 64:ff9b::a.b.c.d ou 64:ff9b::WWXX:YYZZ
  if (low.startsWith('64:ff9b:')) {
    const tail = low.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (tail) return tail[1];
    const hx = low.match(/:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hx) {
      const a = parseInt(hx[1], 16), b = parseInt(hx[2], 16);
      return [(a >> 8) & 255, a & 255, (b >> 8) & 255, b & 255].join('.');
    }
  }
  return null;
}

function isBlockedIPv6(ip) {
  const low = ip.toLowerCase().replace(/%.*$/, ''); // enlève un éventuel zone id
  if (low === '::1' || low === '::') return true;    // loopback / non spécifié
  const v4 = embeddedIPv4(low);
  if (v4) return isBlockedIPv4(v4);                  // mapped / 6to4 / NAT64 → juge l'IPv4
  if (low.startsWith('fe80') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true; // lien-local fe80::/10
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // ULA fc00::/7
  if (low.startsWith('ff')) return true;             // multicast ff00::/8
  if (low.startsWith('100:')) return true;           // 100::/64 discard-only
  if (low.startsWith('2001:db8')) return true;       // documentation
  if (low.startsWith('::ffff:') || low.startsWith('::')) return true; // compat/mapped restants
  return false;
}

// Nom historique conservé (utilisé par safeProbe et exporté) : "privé OU réservé".
function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true; // inconnu → bloqué par prudence
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2) Lookup épinglé : valide ET fournit au socket l'adresse exacte contrôlée.
 *    `resolver` injectable pour les tests (défaut : dns.lookup réel).
 * ────────────────────────────────────────────────────────────────────────── */
function makeGuardedLookup(resolver) {
  const look = resolver || ((h, cb) => dns.lookup(h, { all: true }, cb));
  return function guardedLookup(hostname, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    look(hostname, (err, addresses) => {
      if (err) return cb(pubErr('Nom de domaine introuvable (DNS)'));
      const list = Array.isArray(addresses) ? addresses
        : [{ address: addresses, family: (options && options.family) || 4 }];
      if (list.length === 0) return cb(pubErr('Nom de domaine introuvable (DNS)'));
      // STRICT : si UNE seule adresse résolue est interdite, on refuse tout le nom
      // (empêche un jeu d'enregistrements mêlant IP publique et IP interne).
      if (list.some((a) => isPrivateIP(a.address))) {
        return cb(pubErr('Cible non autorisée (adresse privée ou réservée)'));
      }
      const chosen = list[0];
      cb(null, chosen.address, net.isIPv6(chosen.address) ? 6 : 4);
    });
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3) Décompression bornée (anti-bombe) : limite APRÈS décompression.
 * ────────────────────────────────────────────────────────────────────────── */
function decodeBody(buf, encoding, maxBytes) {
  const enc = String(encoding || '').toLowerCase().trim();
  const opt = { maxOutputLength: maxBytes };
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(buf, opt);
    if (enc === 'deflate') {
      try { return zlib.inflateSync(buf, opt); } catch { return zlib.inflateRawSync(buf, opt); }
    }
    if (enc === 'br') return zlib.brotliDecompressSync(buf, { maxOutputLength: maxBytes });
    if (enc === '' || enc === 'identity') return buf; // déjà plafonné à la lecture
    throw pubErr('Encodage de contenu non supporté');
  } catch (e) {
    if (e && e.public) throw e;
    if (e && (e.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|too large/i.test(e.message || ''))) {
      throw pubErr('Réponse trop volumineuse après décompression');
    }
    throw pubErr('Décompression impossible');
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4) Requête bas niveau sécurisée (GET/HEAD) : lookup épinglé, pas de redirection.
 * ────────────────────────────────────────────────────────────────────────── */
function isRedirect(code) { return code >= 300 && code < 400; }

function guardedRequest(rawUrl, opts) {
  const { timeoutMs, maxBytes, accept, headers, method = 'GET', resolver } = opts;
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(rawUrl); } catch { return reject(pubErr('URL invalide')); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(pubErr('Seuls les protocoles http et https sont autorisés'));
    }
    const mod = url.protocol === 'https:' ? https : http;
    const reqHeaders = Object.assign(
      { 'User-Agent': BOT_UA, Accept: accept || 'application/json', 'Accept-Encoding': 'gzip, deflate, br' },
      headers || {}
    );
    const req = mod.request(url, { method, headers: reqHeaders, lookup: makeGuardedLookup(resolver) }, (res) => {
      // Redirection : JAMAIS suivie (avec l'épinglage d'IP, c'est la seconde ligne
      // de défense contre une redirection vers une adresse interne).
      if (isRedirect(res.statusCode)) {
        res.destroy();
        return reject(pubErr('Redirection refusée (sécurité)'));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.destroy();
        return reject(pubErr(`Réponse HTTP ${res.statusCode}`));
      }
      const declared = Number(res.headers['content-length']);
      if (declared && declared > maxBytes) { res.destroy(); return reject(pubErr('Réponse trop volumineuse')); }
      if (method === 'HEAD') { res.resume(); return resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.alloc(0) }); }

      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { res.destroy(); reject(pubErr('Réponse trop volumineuse')); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        try {
          const body = decodeBody(Buffer.concat(chunks), res.headers['content-encoding'], maxBytes);
          resolve({ status: res.statusCode, headers: res.headers, buffer: body });
        } catch (e) { reject(e); }
      });
      res.on('error', () => reject(pubErr('Impossible de lire la réponse')));
    });
    req.setTimeout(timeoutMs, () => req.destroy(pubErr(`Délai dépassé (>${Math.round(timeoutMs / 1000)}s)`)));
    req.on('error', (err) => reject(err && err.public ? err : pubErr('Impossible de joindre l\'URL')));
    req.end();
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * 5) robots.txt (opt-in) pour les URLs soumises par des utilisateurs.
 * ────────────────────────────────────────────────────────────────────────── */
// Analyse robots.txt et dit si `path` est interdit pour `token` (sinon groupe *).
// Règle de précédence : correspondance la PLUS LONGUE entre Allow et Disallow.
function robotsDisallows(txt, path, token) {
  if (!txt) return false;
  const groups = []; // { agents:Set, rules:[{allow,prefix}] }
  let cur = null, lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: new Set(), rules: [] }; groups.push(cur); }
      cur.agents.add(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && cur) {
      cur.rules.push({ allow: field === 'allow', prefix: value });
      lastWasAgent = false;
    } else { lastWasAgent = false; }
  }
  const tok = String(token || '*').toLowerCase();
  const pick = groups.find((g) => g.agents.has(tok)) || groups.find((g) => g.agents.has('*'));
  if (!pick) return false;
  let best = null; // { allow, len } : correspondance la plus longue l'emporte
  for (const r of pick.rules) {
    if (r.prefix === '') continue; // "Disallow:" vide = tout autorisé → non bloquant
    if (path.startsWith(r.prefix) && (!best || r.prefix.length > best.len)) {
      best = { allow: r.allow, len: r.prefix.length };
    }
  }
  return best ? !best.allow : false;
}

async function enforceRobots(url, resolver) {
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  let txt = '';
  try {
    const r = await guardedRequest(robotsUrl, {
      timeoutMs: 4000, maxBytes: 64 * 1024, accept: 'text/plain', method: 'GET', resolver,
    });
    txt = r.buffer.toString('utf8');
  } catch { return; } // robots injoignable/absent → on autorise (comportement standard)
  if (robotsDisallows(txt, url.pathname + (url.search || ''), BOT_TOKEN)) {
    throw pubErr('Accès interdit par le robots.txt du site');
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * 6) API publique (signatures inchangées).
 * ────────────────────────────────────────────────────────────────────────── */
async function safeFetchText(rawUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;
  if (opts.robots) {
    let u; try { u = new URL(rawUrl); } catch { throw pubErr('URL invalide'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw pubErr('Seuls les protocoles http et https sont autorisés');
    await enforceRobots(u, opts.resolver);
  }
  const r = await guardedRequest(rawUrl, {
    timeoutMs, maxBytes, accept: opts.accept || 'application/json', headers: opts.headers, resolver: opts.resolver,
  });
  return r.buffer.toString('utf8');
}

async function safeFetchJson(rawUrl, opts = {}) {
  const text = await safeFetchText(rawUrl, opts);
  try { return JSON.parse(text); }
  catch { throw pubErr('Le contenu récupéré n\'est pas du JSON valide'); }
}

const DEFAULT_MAX_BYTES_BIN = 10 * 1024 * 1024; // 10 Mo (une grille tarifaire PDF ~1-2 Mo)
async function safeFetchBuffer(rawUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES_BIN;
  if (opts.robots) {
    let u; try { u = new URL(rawUrl); } catch { throw pubErr('URL invalide'); }
    await enforceRobots(u, opts.resolver);
  }
  const r = await guardedRequest(rawUrl, {
    timeoutMs, maxBytes, accept: opts.accept || 'application/pdf, application/octet-stream, */*', headers: opts.headers, resolver: opts.resolver,
  });
  return r.buffer;
}

// ── Sonde de DISPONIBILITÉ ───────────────────────────────────────────────────
// Teste si une URL RÉPOND sans télécharger le corps, sans throw sur 4xx/5xx.
// Suit les redirections manuellement en RE-VALIDANT l'anti-SSRF à chaque saut
// (via isPrivateIP, désormais élargi aux plages réservées). Retourne un objet
// structuré. (La sonde ne lit pas de corps : le risque de rebinding y est limité.)
const DEFAULT_PROBE_TIMEOUT_MS = 7_000;
const PROBE_HEADERS = { 'User-Agent': BOT_UA, Accept: '*/*' };

async function safeProbe(rawUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_PROBE_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects != null ? opts.maxRedirects : 5;

  let current;
  try { current = new URL(rawUrl); }
  catch { return { ok: false, status: null, redirected: false, timedOut: false, error: 'URL invalide' }; }

  let redirected = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  async function probeOnce(href) {
    try {
      const res = await fetch(href, { method: 'HEAD', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
      if (res.status === 405 || res.status === 501) {
        return await fetch(href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
      }
      return res;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return await fetch(href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
    }
  }

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        return { ok: false, status: null, redirected, timedOut: false, error: 'Protocole non autorisé' };
      }
      let addresses;
      try { addresses = await dnsp.lookup(current.hostname, { all: true }); }
      catch { return { ok: false, status: null, redirected, timedOut: false, error: 'Nom de domaine introuvable (DNS)' }; }
      if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address))) {
        return { ok: false, status: null, redirected, timedOut: false, error: 'Cible non autorisée (adresse privée ou réservée)' };
      }

      const res = await probeOnce(current.href);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc) {
          let next;
          try { next = new URL(loc, current.href); }
          catch { return { ok: false, status: res.status, redirected: true, timedOut: false, error: 'Redirection invalide' }; }
          redirected = true;
          current = next;
          continue;
        }
      }
      return { ok: res.status >= 200 && res.status < 400, status: res.status, redirected, timedOut: false, error: null };
    }
    return { ok: false, status: null, redirected: true, timedOut: false, error: 'Trop de redirections' };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, status: null, redirected, timedOut: true, error: 'Délai dépassé' };
    return { ok: false, status: null, redirected, timedOut: false, error: 'Impossible de joindre le domaine' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  safeFetchJson, safeFetchText, safeFetchBuffer, safeProbe,
  isPrivateIP, pubErr, BROWSER_UA, BOT_UA, BOT_TOKEN,
  // Exposés pour les tests unitaires (logique pure, sans réseau) :
  isBlockedIPv4, isBlockedIPv6, embeddedIPv4, decodeBody, robotsDisallows, makeGuardedLookup, isRedirect,
};
