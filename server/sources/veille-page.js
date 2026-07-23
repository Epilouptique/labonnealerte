// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE DE PAGE générique. L'abonné saisit une URL ;
// la source alerte dès que le CONTENU TEXTUEL VISIBLE de la page change. C'est « nouvelle
// annonce leboncoin » appliqué à n'importe quel site.
//
// ⚠️ CHANTIER SENSIBLE : l'URL est fournie par l'utilisateur → anti-SSRF OBLIGATOIRE via
// safeFetchText (IP privées/loopback interdites, pas de redirection, taille plafonnée,
// timeout). https uniquement.
//
// Détection : hash SHA-256 du TEXTE VISIBLE DENOISÉ (lib/hash-diff-html) — on ne dit JAMAIS
// ce qui a changé, seulement qu'un changement a été détecté. Référence au 1er cycle SANS
// alerte (pattern hausse-tarif-operateur) ; cache mémoire par URL, TTL 6h, plafond de fetchs.
//
// ── LIMITES CONNUES (V1) — dégradation silencieuse, jamais de fausse alerte ────
//   • Sites anti-bot (Cloudflare/WAF, ex. legifrance) → 403 : inactive silencieux. On ne
//     contourne PAS.
//   • Contenu rendu en JavaScript (SPA) : invisible dans le HTML brut → non détectable en V1
//     (évolution possible : rendu headless via withPage).
//   • Pages intrinsèquement dynamiques (homepages d'actualité) : changent à chaque visite →
//     faux positifs « légitimes ». L'utilisateur doit choisir une page adaptée (évolution
//     future : sélection de zone CSS pour ne hasher qu'un fragment).

const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
const { hashHtml } = require('./lib/hash-diff-html');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo (une page peut être volumineuse)
const WEEK_MS = 6 * 60 * 60 * 1000;   // TTL 6h (poll réel ~4×/jour, poli pour les petits sites)
const RETRY_MS = 60 * 60 * 1000;      // réessai 1h après un échec (pas d'attente de 6h)
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const URL_RE = /^https:\/\/[^\s]{1,300}$/i;

const paramsSchema = [
  {
    key: 'url',
    label: 'URL de la page à surveiller',
    type: 'string',
    placeholder: 'https://exemple.fr/page',
    pattern: '^https://[^\\s]{1,300}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'URL https d\'une page. Vous êtes prévenu quand son contenu change. Fonctionne mieux sur des pages « classiques » (pas les sites 100% JavaScript ni les pages d\'actualité qui changent en continu).',
  },
];

// Cache par URL : { hash, at, ttl, result }.
const cache = new Map();

function inactive(url) {
  return { state: 'inactive', since: null, until: null, message: null, url: URL_RE.test(url) ? url : 'https://labonnealerte.fr' };
}

function changement(url) {
  return {
    state: 'active', since: new Date(), until: null,
    message: `🔔 Le contenu de ${url} a changé — à consulter.`,
    url,
  };
}

async function signatureOf(url) {
  const html = await safeFetchText(url, {
    timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: 'text/html',
    headers: { 'User-Agent': BROWSER_UA },
  });
  return hashHtml(html).hash;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const url = String((params && params.url) || '');
    if (!URL_RE.test(url)) { out.push(Object.assign({ params }, inactive(url))); continue; }

    const entry = cache.get(url);
    if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(url))); continue; }
    fetches += 1;

    let result;
    try {
      const hash = await signatureOf(url);
      if (!entry || entry.hash == null) {
        result = inactive(url); // 1er cycle : référence mémorisée, AUCUNE alerte
        cache.set(url, { hash, at: now, ttl: WEEK_MS, result });
      } else if (hash !== entry.hash) {
        result = changement(url); // changement détecté (one-shot : réf. mise à jour)
        cache.set(url, { hash, at: now, ttl: WEEK_MS, result });
      } else {
        result = inactive(url);
        cache.set(url, { hash: entry.hash, at: now, ttl: WEEK_MS, result });
      }
    } catch (err) {
      // 403 anti-bot / timeout / SSRF bloqué / réseau → inactive silencieux, réessai rapproché.
      console.warn(`[veille-page] ${url} : ${err.message} → inactive.`);
      result = inactive(url);
      cache.set(url, { hash: entry ? entry.hash : null, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'veille-page', paramsSchema, checkWithParams };
