// Source PARAMÉTRÉE (OpenAlert v2) : réputation SÉCURITÉ d'un domaine au choix de
// l'abonné (carte « webmaster/pro », sœur de domaine-disponibilite). Le domaine est
// interrogé dans la base publique URLhaus (abuse.ch) : est-il associé à des URLs de
// malware / phishing ?
//
// API : POST https://urlhaus-api.abuse.ch/v1/host/ (host=<domaine>), header Auth-Key.
// Clé lue dans l'environnement (URLHAUS_AUTH_KEY, configurée côté Railway comme les
// autres clés du projet : METEOFRANCE_API_KEY, etc.). PAS de clé → dégradation
// silencieuse (inactive) pour ne jamais casser le poller.
//
// ── ALERTE IMMÉDIATE (pas de seuil « 2 échecs ») ─────────────────────────────
// Une inscription en blocklist malware est un signal fort en soi → requires_confirmation
// = FALSE (init.sql) : inactive → active + notification dès le 1er check positif. Donc
// un domaine DÉJÀ signalé au moment de l'ajout déclenche l'alerte au 1er cycle (voulu,
// contrairement à domaine-disponibilite qui temporise sur 2 cycles).
//
// ── Contrat de réponse URLhaus (schéma documenté) ────────────────────────────
// { query_status: "ok" | "no_results" | "invalid_host" | ..., urlhaus_reference,
//   urls: [ { url_status: "online"|"offline", threat: "malware_download"|..., ... } ] }
// On n'active QUE sur query_status === "ok". ⚠️ Parsing basé sur le schéma documenté
// d'URLhaus : la clé n'étant pas disponible dans l'environnement de dev, la structure
// exacte des réponses authentifiées reste à confirmer sur un appel réel en prod (voir
// rapport). Le code lit défensivement (champs optionnels tolérés).

const { DOMAIN_RE, DOMAIN_PATTERN, normalizeDomain, horodatage } = require('./lib/domaine');

const KEY = (process.env.URLHAUS_AUTH_KEY || '').trim();
const API_URL = 'https://urlhaus-api.abuse.ch/v1/host/';
const TIMEOUT_MS = 10_000;
// TTL LONG : la réputation malware bouge lentement, inutile de repoller chaque cycle.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'domaine',
    label: 'Domaine à vérifier',
    type: 'string',
    placeholder: 'annad.fr',
    pattern: DOMAIN_PATTERN,
    lowercase: true,
    multiple: true,
    required: true,
    default: null,
    hint: 'Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le domaine est signalé dans la base malware/phishing publique URLhaus.',
  },
];

// Cache par domaine : domaine → { at, result }.
const cache = new Map();

function inactive(domaine) {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://urlhaus.abuse.ch/browse/' };
}

// Appel authentifié URLhaus. Retourne l'objet JSON, ou lève une erreur (réseau/HTTP).
async function queryHost(domaine) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Auth-Key': KEY, Accept: 'application/json' },
      body: 'host=' + encodeURIComponent(domaine),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // 401/403 (clé invalide), 5xx, 429…
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Construit l'état d'un domaine à partir de la réponse URLhaus.
function resultFor(domaine, data) {
  if (!data || data.query_status !== 'ok') return inactive(domaine); // no_results / invalid_host / autre
  const urls = Array.isArray(data.urls) ? data.urls : [];
  // Types de menace observés (champ `threat` au niveau URL), sans sur-interprétation.
  const threats = [...new Set(urls.map((u) => u && u.threat).filter(Boolean))];
  const online = urls.filter((u) => u && u.url_status === 'online').length;
  const ref = data.urlhaus_reference || ('https://urlhaus.abuse.ch/host/' + domaine + '/');
  const now = new Date();
  const menace = threats.length ? threats.join(', ') : 'menace signalée';
  const actives = online ? `, ${online} URL(s) active(s)` : '';
  return {
    state: 'active',
    since: now,
    until: null,
    message: `⚠️ Le domaine ${domaine} est signalé dans la base malware URLhaus (${menace}${actives}). Détecté le ${horodatage(now)}.`,
    url: ref,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];

  // Pas de clé → dégradation silencieuse (jamais d'erreur qui casse le poller).
  if (!KEY) {
    console.warn('[domaine-securite] URLHAUS_AUTH_KEY absente → source inactive (dégradation silencieuse).');
    return combos.map((params) => Object.assign({ params }, inactive(normalizeDomain(params && params.domaine))));
  }

  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const domaine = normalizeDomain(params && params.domaine);
    if (!DOMAIN_RE.test(domaine)) { out.push(Object.assign({ params }, inactive(domaine || 'inconnu'))); continue; }

    const cached = cache.get(domaine);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, cached ? cached.result : inactive(domaine)));
      continue;
    }
    fetches += 1;

    let result;
    try {
      const data = await queryHost(domaine);
      result = resultFor(domaine, data);
    } catch (err) {
      // Timeout / 5xx / 401-403 (clé invalide) / JSON illisible → inactive silencieux + log.
      console.warn(`[domaine-securite] ${domaine} : appel URLhaus échoué (${err.message}) → inactive.`);
      result = inactive(domaine);
    }
    cache.set(domaine, { at: Date.now(), result });
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[domaine-securite] ${combos.length} domaines suivis, ${MAX_FETCH} vérifiés ce cycle.`);
  }
  return out;
}

module.exports = { id: 'domaine-securite', paramsSchema, checkWithParams };
