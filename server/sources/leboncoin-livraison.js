// Source interne : détecte la promo « Livraison à 0,99 € » (Mondial Relay) sur
// leboncoin (page /service/bons-plans).
//
// STRATÉGIE — statique UNIQUEMENT (constat prod) :
//  - Le fetch statique renvoie HTTP 200 avec le HTML Next.js SSR COMPLET
//    (bloc __NEXT_DATA__) : le contenu de la page bons-plans y est présent,
//    donc la promo — quand elle est active — s'y trouve aussi.
//  - DataDome bloque l'IP datacenter (Railway) en 403 de façon intermittente,
//    ET détecte systématiquement le Chromium headless. Le navigateur en secours
//    ne sert donc à RIEN contre DataDome et gaspille des ressources → supprimé
//    pour cette source. En cas de 403/blocage : on throw, et comme
//    requires_confirmation=true, le poller laisse l'état intact (pas de fausse
//    transition, la promo réelle sera confirmée dès qu'un cycle passe).
//
// Pour ressembler à un vrai navigateur et limiter les 403 : en-têtes HTTP
// complets + réutilisation des cookies (jar mémoire) d'un cycle à l'autre.
//
// Le bug historique (« le statique ne voit jamais la promo ») venait du marqueur
// contenant des espaces insécables, que la comparaison à espace simple ratait :
// on normalise les espaces avant de chercher le marqueur.

// node-fetch v3 est ESM-only : import dynamique depuis ce module CommonJS.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatDateFr } = require('./lib/format-fr');

const PROMO_URL = 'https://www.leboncoin.fr/service/bons-plans';
const PROMO_MARKER = 'Livraison à 0,99';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// En-têtes d'une vraie navigation Chrome (document top-level).
const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://www.leboncoin.fr/',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

// Cookie jar mémoire (simple) : conserve les Set-Cookie reçus et les renvoie au
// cycle suivant, comme le ferait un navigateur (aide à passer certains contrôles).
const cookieJar = new Map(); // nom -> valeur

function cookieHeader() {
  if (cookieJar.size === 0) return null;
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  const raw = typeof res.headers.raw === 'function' ? res.headers.raw()['set-cookie'] : null;
  const single = res.headers.get ? res.headers.get('set-cookie') : null;
  const list = raw || (single ? [single] : []);
  for (const line of list) {
    const pair = String(line).split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) cookieJar.set(name, value);
    }
  }
}

// Cherche "du JJ/MM/AAAA à HHhMM au JJ/MM/AAAA à HHhMM"
const DATE_REGEX =
  /du\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})/i;

// Normalise tous les espaces (dont insécable   et fine insécable  ) en
// espace simple : les marqueurs et dates de leboncoin en contiennent souvent.
function normalizeSpaces(text) {
  return String(text || '').replace(/[  \s]+/g, ' ');
}

function buildDate(day, month, year, hour, minute) {
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

// Signatures caractéristiques d'un blocage anti-bot (DataDome / captcha).
function looksLikeAntiBot(text, title) {
  const hay = (normalizeSpaces(text) + ' ' + (title || '')).toLowerCase();
  return (
    hay.includes('captcha-delivery') ||
    hay.includes('datadome') ||
    hay.includes('geo.captcha') ||
    hay.includes('pardon our interruption') ||
    hay.includes('vous avez été bloqué') ||
    hay.includes('verifying you are human')
  );
}

// Une réponse statique est « exploitable » si c'est bien la page Next.js complète.
function looksLikeRealPage(html) {
  return html.includes('__NEXT_DATA__');
}

// Construit le résultat "active" à partir d'un texte normalisé contenant le marqueur.
function buildActive(normalizedText) {
  const match = normalizedText.match(DATE_REGEX);
  const since = match ? buildDate(match[1], match[2], match[3], match[4], match[5]) : null;
  const until = match ? buildDate(match[6], match[7], match[8], match[9], match[10]) : null;
  const jusqua = until ? ` jusqu'au ${formatDateFr(until, { withTime: true })}` : '';
  return {
    state: 'active',
    since,
    until,
    message: `📦 La livraison Mondial Relay passe à 0,99 € sur leboncoin${jusqua}`,
    url: PROMO_URL,
  };
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PROMO_URL };
}

// Fetch statique « façon navigateur » (en-têtes complets + cookies). Retourne
// { status, html } ou null (erreur réseau).
async function staticFetch() {
  try {
    const headers = { ...BROWSER_HEADERS };
    const cookie = cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const res = await fetchFn(PROMO_URL, { headers });
    storeCookies(res); // mémorise les cookies pour le prochain cycle
    return { status: res.status, html: await res.text() };
  } catch (err) {
    return null;
  }
}

/**
 * Vérifie l'état instantané de la promo — STATIQUE UNIQUEMENT.
 * @returns {Promise<{ state, since, until, message, url }>}
 */
async function check() {
  const stat = await staticFetch();

  if (!stat) {
    throw new Error('leboncoin injoignable (erreur réseau)');
  }
  // Blocage DataDome (IP datacenter) : 403 direct ou page anti-bot renvoyée en 200.
  if (stat.status === 403 || looksLikeAntiBot(stat.html)) {
    throw new Error('Blocage anti-bot leboncoin (IP datacenter)');
  }
  // On exige la page Next.js complète (SSR) : sinon réponse inexploitable.
  if (stat.status !== 200 || !looksLikeRealPage(stat.html)) {
    throw new Error(`Réponse inattendue leboncoin (HTTP ${stat.status})`);
  }

  const norm = normalizeSpaces(stat.html);
  return norm.includes(PROMO_MARKER) ? buildActive(norm) : inactive();
}

module.exports = { id: 'leboncoin-livraison', check };
