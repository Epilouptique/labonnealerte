// Source interne : le giveaway GOG (jeu PC sans DRM offert ponctuellement).
//
// Les giveaways GOG sont rares et ponctuels. Détection en DEUX temps économes :
//  1. GET https://www.gog.com/giveaway : renvoie 404 quand aucun giveaway n'est
//     actif (le cas ~95 % du temps) → 'inactive', SANS lancer de navigateur.
//  2. Si 200 : le bandeau giveaway de la home n'existe qu'après rendu JS. On
//     charge alors https://www.gog.com dans le runner headless mutualisé et on
//     extrait titre / date de fin / URL du jeu. Extraction best-effort : si elle
//     échoue malgré un giveaway actif, on dégrade gracieusement (message
//     générique) plutôt que d'échouer.
//
// La logique de transition vit dans le poller ; check() rapporte l'état instantané.

const { withPage } = require('../headless');
const { formatDateFr } = require('./lib/format-fr');

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const GIVEAWAY_URL = 'https://www.gog.com/giveaway';
const HOME_URL = 'https://www.gog.com/fr'; // locale fr
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: GIVEAWAY_URL };
}

// Étape 1 : statut HTTP de /giveaway. 404 = pas de giveaway. Renvoie le code,
// ou null en cas d'erreur réseau (on tentera alors quand même le rendu).
async function giveawayStatus() {
  try {
    const res = await fetchFn(GIVEAWAY_URL, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    });
    return res.status;
  } catch (err) {
    return null;
  }
}

// Étape 2 : rendu de la home et extraction best-effort du bandeau giveaway.
async function extractFromHome() {
  return withPage(async (page) => {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 8_000 });
    } catch (err) {
      /* best-effort */
    }

    return page.evaluate(() => {
      const out = { antibot: false, hasContainer: false, title: null, url: null, endText: null };
      const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
      if (
        bodyText.includes('captcha') ||
        bodyText.includes('access denied') ||
        bodyText.includes('datadome') ||
        bodyText.includes('request blocked')
      ) {
        out.antibot = true;
        return out;
      }

      // Conteneur giveaway : web component ou classe/id contenant "giveaway".
      const container = document.querySelector(
        'giveaway-banner, [class*="giveaway" i], [id*="giveaway" i]'
      );
      out.hasContainer = !!container;
      const scope = container || document.body;

      // Lien vers la page du jeu (titre + URL).
      const link = scope.querySelector('a[href*="/game/"], a[href*="/fr/game/"]');
      if (link) {
        out.url = link.href;
        out.title = (link.getAttribute('aria-label') || link.textContent || '').trim() || null;
      }
      if (!out.title && container) {
        const h = container.querySelector('h1, h2, h3, [class*="title" i], [class*="name" i]');
        if (h) out.title = (h.textContent || '').trim() || null;
      }

      // Date/heure de fin éventuelle : attribut datetime ou compte à rebours.
      const timeEl = scope.querySelector(
        'time[datetime], [datetime], [class*="countdown" i], [class*="timer" i]'
      );
      if (timeEl) {
        out.endText = (timeEl.getAttribute('datetime') || timeEl.textContent || '').trim() || null;
      }
      return out;
    });
  });
}

/**
 * Vérifie l'état instantané du giveaway GOG.
 * @returns {Promise<{ state, since, until, message, url }>}
 */
async function check() {
  // 1) Sonde statique : 404 → pas de giveaway (zéro navigateur).
  const status = await giveawayStatus();
  if (status === 404) return inactive();
  if (status !== 200 && status !== null) {
    // 403 = anti-bot probable ; autre = réponse inattendue.
    throw new Error(`Réponse inattendue GOG /giveaway (HTTP ${status})`);
  }

  // 2) Un giveaway semble actif (200, ou statique indisponible) → rendu JS.
  const data = await extractFromHome();

  if (data.antibot) {
    throw new Error('Blocage anti-bot GOG');
  }

  const since = new Date(); // première détection : NOW (pas de date de début publiée)

  // Date de fin : on n'accepte qu'une valeur qui parse en date valide et future.
  let until = null;
  if (data.endText) {
    const d = new Date(data.endText);
    if (!Number.isNaN(d.getTime()) && d.getTime() > since.getTime()) until = d;
  }

  const url = data.url || GIVEAWAY_URL;

  // Message : nominal si on a le titre, dégradé gracieux sinon.
  let message;
  if (data.title && until) {
    message = `🎮 ${data.title} est offert sur GOG jusqu'au ${formatDateFr(until)}`;
  } else if (data.title) {
    message = `🎮 ${data.title} est offert sur GOG en ce moment`;
  } else {
    message = '🎮 Un jeu est offert sur GOG en ce moment';
  }

  return { state: 'active', since, until, message, url };
}

module.exports = { id: 'gog-jeu-offert', check };
