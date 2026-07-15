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

module.exports = { safeFetchJson, safeFetchText, isPrivateIP, pubErr };
