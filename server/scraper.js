// node-fetch v3 est ESM-only : on l'importe dynamiquement depuis ce module CommonJS.
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
 * Vérifie la présence de la promo "Livraison à 0,99" sur Leboncoin.
 * @returns {Promise<{ found: boolean, date_debut: Date|null, date_fin: Date|null }>}
 */
async function checkPromo() {
  const res = await fetchFn(PROMO_URL, {
    headers: {
      // Un User-Agent réaliste limite les blocages basiques.
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

  // --- Mode debug : aperçu du HTML reçu et détection du marqueur ---
  console.log('[scraper][debug] HTML reçu (500 premiers caractères) :');
  console.log(html.slice(0, 500));
  console.log(
    `[scraper][debug] "${PROMO_MARKER}" ${found ? 'TROUVÉE' : 'NON trouvée'} ` +
      `(indexOf = ${html.indexOf(PROMO_MARKER)})`
  );
  // -------------------------------------------------------------------

  if (!found) {
    return { found: false, date_debut: null, date_fin: null };
  }

  const match = html.match(DATE_REGEX);
  if (!match) {
    // Promo détectée mais dates introuvables/format inattendu.
    return { found: true, date_debut: null, date_fin: null };
  }

  const [, d1, m1, y1, h1, min1, d2, m2, y2, h2, min2] = match;
  return {
    found: true,
    date_debut: buildDate(d1, m1, y1, h1, min1),
    date_fin: buildDate(d2, m2, y2, h2, min2),
  };
}

module.exports = { checkPromo };
