// Récupération HTTP sécurisée (anti-SSRF) partagée par le validateur /proposer
// et le poller des sources externes. Refuse les IP privées/loopback/lien-local,
// interdit le suivi de redirection, plafonne la taille, impose un timeout.

const dns = require('dns').promises;
const net = require('net');

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 100 * 1024; // 100 Ko

// Erreur « publique » : message sûr à renvoyer au client (rédigé par nous).
function pubErr(msg) { const e = new Error(msg); e.public = true; return e; }

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 0) return true;
  return false;
}

function isPrivateIP(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const low = ip.toLowerCase();
  if (low === '::1') return true;
  if (low === '::') return true;
  if (low.startsWith('fe80')) return true;
  if (low.startsWith('fc') || low.startsWith('fd')) return true;
  return false;
}

// Récupère le TEXTE brut d'une URL distante avec toutes les protections anti-SSRF
// (IP privées interdites, pas de suivi de redirection, taille plafonnée, timeout).
// opts.accept surcharge l'en-tête Accept (défaut application/json). Peut throw pubErr.
async function safeFetchText(rawUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;
  const accept = opts.accept || 'application/json';

  let url;
  try { url = new URL(rawUrl); } catch { throw pubErr('URL invalide'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw pubErr('Seuls les protocoles http et https sont autorisés');
  }

  let addresses;
  try { addresses = await dns.lookup(url.hostname, { all: true }); }
  catch { throw pubErr('Nom de domaine introuvable (DNS)'); }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address))) {
    throw pubErr('Cible non autorisée (adresse privée ou locale)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'error', // pas de rebond SSRF
      headers: { Accept: accept },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw pubErr(`Délai dépassé (>${Math.round(timeoutMs / 1000)}s)`);
    throw pubErr('Impossible de joindre l\'URL');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw pubErr(`Réponse HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (declared && declared > maxBytes) throw pubErr('Réponse trop volumineuse (> 100 Ko)');

  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw pubErr('Réponse trop volumineuse (> 100 Ko)');
  return text;
}

// Récupère et parse un JSON distant (mêmes protections). Peut throw pubErr.
async function safeFetchJson(rawUrl, opts = {}) {
  const text = await safeFetchText(rawUrl, opts);
  try { return JSON.parse(text); }
  catch { throw pubErr('Le contenu récupéré n\'est pas du JSON valide'); }
}

// ── Sonde de DISPONIBILITÉ (voisine de safeFetchText, ne la modifie pas) ─────
// safeProbe teste si une URL RÉPOND, sans télécharger le corps et SANS lever
// d'exception sur un 4xx/5xx (c'est justement ce qu'on veut détecter). Réutilise
// la même couche anti-SSRF (résolution DNS + rejet IP privées) — appliquée à
// CHAQUE saut de redirection, car on suit les redirections manuellement (un
// domaine sain redirige souvent http→https ou apex→www ; mais une redirection
// vers une IP interne resterait une tentative SSRF à bloquer).
// Retourne TOUJOURS un objet structuré (jamais de throw) :
//   { ok:boolean, status:number|null, redirected:boolean, timedOut:boolean, error:string|null }
//   ok = true si le statut FINAL est 2xx/3xx (le site répond) ; false sinon.
const DEFAULT_PROBE_TIMEOUT_MS = 7_000;
const PROBE_HEADERS = { 'User-Agent': 'LaBonneAlerte-Probe/1.0', Accept: '*/*' };

async function safeProbe(rawUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_PROBE_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects != null ? opts.maxRedirects : 5;

  let current;
  try { current = new URL(rawUrl); }
  catch { return { ok: false, status: null, redirected: false, timedOut: false, error: 'URL invalide' }; }

  let redirected = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // HEAD d'abord ; bascule sur GET si HEAD non supporté (405/501) ou refusé.
  async function probeOnce(href) {
    try {
      const res = await fetch(href, { method: 'HEAD', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
      if (res.status === 405 || res.status === 501) {
        return await fetch(href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
      }
      return res;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // Certains serveurs coupent la connexion sur HEAD → on retente en GET.
      return await fetch(href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: PROBE_HEADERS });
    }
  }

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        return { ok: false, status: null, redirected, timedOut: false, error: 'Protocole non autorisé' };
      }
      // Anti-SSRF à chaque saut : DNS + rejet IP privées/loopback/lien-local.
      let addresses;
      try { addresses = await dns.lookup(current.hostname, { all: true }); }
      catch { return { ok: false, status: null, redirected, timedOut: false, error: 'Nom de domaine introuvable (DNS)' }; }
      if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address))) {
        return { ok: false, status: null, redirected, timedOut: false, error: 'Cible non autorisée (adresse privée ou locale)' };
      }

      const res = await probeOnce(current.href);

      // Redirection 3xx avec Location → on suit manuellement (re-validation au tour suivant).
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
      // Réponse finale : 2xx/3xx = le site répond ; 4xx/5xx = panne (ok=false, sans throw).
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

module.exports = { safeFetchJson, safeFetchText, safeProbe, isPrivateIP, pubErr };
