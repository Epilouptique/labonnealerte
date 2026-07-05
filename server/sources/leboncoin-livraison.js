// Source interne : détecte la promo "Livraison à 0,99€" sur Leboncoin.
// La logique de transition pending/active vit dans le poller, pas ici :
// check() se contente de rapporter l'état instantané (active | inactive).

// node-fetch v3 est ESM-only : import dynamique depuis ce module CommonJS.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const PROMO_URL = 'https://www.leboncoin.fr/service/bons-plans';
const PROMO_MARKER = 'Livraison à 0,99';

// Cherche "du JJ/MM/AAAA à HHhMM au JJ/MM/AAAA à HHhMM"
const DATE_REGEX =
  /du\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})\s+à\s+(\d{1,2})h(\d{2})/i;

function buildDate(day, month, year, hour, minute) {
  // Mois 0-indexé pour le constructeur Date
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
}

/**
 * Vérifie l'état instantané de la promo.
 * @returns {Promise<{ state: 'active'|'inactive', since: Date|null, until: Date|null, message: string|null, url: string }>}
 */
async function check() {
  const res = await fetchFn(PROMO_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue : ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const found = html.includes(PROMO_MARKER);

  if (!found) {
    return { state: 'inactive', since: null, until: null, message: null, url: PROMO_URL };
  }

  const match = html.match(DATE_REGEX);
  const since = match ? buildDate(match[1], match[2], match[3], match[4], match[5]) : null;
  const until = match ? buildDate(match[6], match[7], match[8], match[9], match[10]) : null;

  return {
    state: 'active',
    since,
    until,
    message: 'Livraison à 0,99€ active sur Leboncoin',
    url: PROMO_URL,
  };
}

module.exports = { id: 'leboncoin-livraison', check };
