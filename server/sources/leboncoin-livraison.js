// Source interne : détecte la promo « Livraison Mondial Relay à 0,99 € » sur leboncoin.
//
// DÉTECTION VIA DEALABS (bascule du 06/09/2026, fin de la phase d'observation).
// La logique de détection vit dans sources/lib/dealabs-promo.js — partagée mot pour mot
// avec la sonde de contrôle (server/leboncoin-promo-probe.js) : un seul parseur, donc
// aucun risque que l'alerte et la mesure divergent silencieusement.
//
// POURQUOI PAS LE SCRAPING DIRECT : voir le bloc « HISTORIQUE » en bas de fichier.
//
// check() rapporte l'état instantané ; la transition vit dans le poller.

const { detectDealabsPromo } = require('./lib/dealabs-promo');

// L'URL montrée à l'abonné reste leboncoin : c'est là qu'il va profiter de la promo.
// Dealabs est notre capteur, pas la destination — l'attribution se fait dans le message.
const PROMO_URL = 'https://www.leboncoin.fr/service/bons-plans';

/**
 * Date de début de l'épisode, dérivée de la publication du thread Dealabs.
 *
 * CRITIQUE POUR L'ANTI-SPAM : le poller ne re-notifie une source déjà active que si
 * `since` avance d'au moins 24 h (EPISODE_THRESHOLD_MS). Un `new Date()` ici
 * renverrait une date neuve à chaque cycle... mais surtout ferait perdre la vraie
 * ancre d'épisode. publishedAt est stable tant que le même thread reste actif : deux
 * week-ends consécutifs = deux threads = deux `since` distants de ~7 jours = une
 * notification par promo, ce qu'on veut exactement.
 *
 * Dealabs sert publishedAt en SECONDES epoch (10 chiffres) ; le parseur accepte
 * 9 à 13 chiffres, on normalise donc avant de construire la Date.
 */
function sinceFromPublishedAt(publishedAt) {
  if (!publishedAt) return null;
  const ms = publishedAt < 1e12 ? publishedAt * 1000 : publishedAt;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PROMO_URL };
}

/**
 * Vérifie l'état instantané de la promo — piste Dealabs uniquement.
 * @returns {Promise<{ state, since, until, message, url }>}
 */
async function check() {
  // detectDealabsPromo throw en cas d'erreur réseau/HTTP : on laisse remonter. Une
  // panne de Dealabs n'est PAS « la promo est finie » ; le poller garde l'état intact.
  const res = await detectDealabsPromo();

  if (res.active_count === 0) return inactive();

  // `until` reste null : Dealabs ne publie pas de date de fin exploitable (elle vit
  // dans le corps du deal, en texte libre non structuré). Plutôt que de la deviner, on
  // ne l'affirme pas — l'ordre de grandeur est donné en clair dans le message.
  return {
    state: 'active',
    since: sinceFromPublishedAt(res.best && res.best.publishedAt),
    until: null,
    message:
      '📦 Livraison Mondial Relay à 0,99 € active sur leboncoin '
      + '(colis ≤ 2 kg, en général jusqu\'au lundi matin) — repéré via Dealabs',
    url: PROMO_URL,
  };
}

module.exports = { id: 'leboncoin-livraison', check };

/* ─── HISTORIQUE — scraping DIRECT de leboncoin.fr, retiré le 06/09/2026 ──────────
 *
 * Retiré du chemin actif : DataDome bloque l'IP datacenter (Railway) en 403 de façon
 * INTERMITTENTE — c'est l'intermittence qui disqualifie la piste, pas le blocage.
 * Un blocage franc serait détectable ; là, la source alternait réponses exploitables et
 * 403 sans motif, rendant impossible de distinguer « promo absente » de « on s'est fait
 * jeter ». Le Chromium headless en secours ne servait à rien (détecté systématiquement)
 * et a été supprimé avant lui. Mesures à l'appui : table promo_probe_log, sonde
 * 'leboncoin-direct', 42 passages.
 *
 * Conservé ici et non supprimé : si Dealabs ferme, change de rendu, ou si leboncoin
 * expose un jour un flux propre, ce code est le point de départ — notamment le piège
 * du marqueur, qui a coûté cher.
 *
 * LE PIÈGE À NE PAS REDÉCOUVRIR : le marqueur « Livraison à 0,99 » contient sur la page
 * des espaces INSÉCABLES (U+00A0) et fines insécables (U+202F). Une comparaison à espace
 * simple ne matche jamais — d'où le bug historique « le statique ne voit jamais la
 * promo ». normalizeSpaces() ci-dessous existe pour ça.
 *
 * const PROMO_MARKER = 'Livraison à 0,99';
 * const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
 *   + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
 *
 * // En-têtes d'une vraie navigation Chrome (document top-level).
 * const BROWSER_HEADERS = {
 *   'User-Agent': UA,
 *   Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*\/*;q=0.8',
 *   'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
 *   'Accept-Encoding': 'gzip, deflate, br',
 *   Referer: 'https://www.leboncoin.fr/',
 *   'Upgrade-Insecure-Requests': '1',
 *   'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
 *   'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-User': '?1',
 *   'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
 *   'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
 * };
 *
 * // Cookie jar mémoire : renvoie les Set-Cookie d'un cycle au suivant, comme un
 * // navigateur (aidait à passer certains contrôles).
 * const cookieJar = new Map();
 * function cookieHeader() {
 *   if (cookieJar.size === 0) return null;
 *   return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
 * }
 * function storeCookies(res) {
 *   const raw = typeof res.headers.raw === 'function' ? res.headers.raw()['set-cookie'] : null;
 *   const single = res.headers.get ? res.headers.get('set-cookie') : null;
 *   for (const line of raw || (single ? [single] : [])) {
 *     const pair = String(line).split(';')[0];
 *     const eq = pair.indexOf('=');
 *     if (eq > 0) {
 *       const name = pair.slice(0, eq).trim();
 *       if (name) cookieJar.set(name, pair.slice(eq + 1).trim());
 *     }
 *   }
 * }
 *
 * // Cherche "du JJ/MM/AAAA à HHhMM au JJ/MM/AAAA à HHhMM" — leboncoin, lui, DONNAIT
 * // la date de fin ; c'est la seule chose que la piste Dealabs fait perdre.
 * const DATE_REGEX = /du\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})/i;
 *
 * function normalizeSpaces(text) { return String(text || '').replace(/[  \s]+/g, ' '); }
 * function buildDate(d, mo, y, h, mi) { return new Date(+y, +mo - 1, +d, +h, +mi); }
 *
 * function looksLikeAntiBot(text, title) {
 *   const hay = (normalizeSpaces(text) + ' ' + (title || '')).toLowerCase();
 *   return hay.includes('captcha-delivery') || hay.includes('datadome')
 *     || hay.includes('geo.captcha') || hay.includes('pardon our interruption')
 *     || hay.includes('vous avez été bloqué') || hay.includes('verifying you are human');
 * }
 * function looksLikeRealPage(html) { return html.includes('__NEXT_DATA__'); }
 *
 * async function staticFetch() {
 *   try {
 *     const headers = { ...BROWSER_HEADERS };
 *     const cookie = cookieHeader();
 *     if (cookie) headers.Cookie = cookie;
 *     const res = await fetchFn(PROMO_URL, { headers });
 *     storeCookies(res);
 *     return { status: res.status, html: await res.text() };
 *   } catch (err) { return null; }
 * }
 *
 * async function checkDirect() {
 *   const stat = await staticFetch();
 *   if (!stat) throw new Error('leboncoin injoignable (erreur réseau)');
 *   if (stat.status === 403 || looksLikeAntiBot(stat.html)) {
 *     throw new Error('Blocage anti-bot leboncoin (IP datacenter)');
 *   }
 *   if (stat.status !== 200 || !looksLikeRealPage(stat.html)) {
 *     throw new Error(`Réponse inattendue leboncoin (HTTP ${stat.status})`);
 *   }
 *   const norm = normalizeSpaces(stat.html);
 *   if (!norm.includes(PROMO_MARKER)) return inactive();
 *   const m = norm.match(DATE_REGEX);
 *   const since = m ? buildDate(m[1], m[2], m[3], m[4], m[5]) : null;
 *   const until = m ? buildDate(m[6], m[7], m[8], m[9], m[10]) : null;
 *   const jusqua = until ? ` jusqu'au ${formatDateFr(until, { withTime: true })}` : '';
 *   return { state: 'active', since, until,
 *     message: `📦 La livraison Mondial Relay passe à 0,99 € sur leboncoin${jusqua}`,
 *     url: PROMO_URL };
 * }
 * ───────────────────────────────────────────────────────────────────────────── */
