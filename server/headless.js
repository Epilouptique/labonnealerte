// Runner headless mutualisé (Playwright / Chromium).
//
// Certaines sources sont des SPA : leur contenu n'existe pas dans le HTML brut,
// il faut un vrai navigateur pour l'obtenir. Ce module fournit un point d'entrée
// unique, withPage(fn), qui :
//   - lance Chromium en headless avec des args « conteneur » (mémoire réduite) ;
//   - n'autorise qu'UN usage à la fois (mutex) : deux sources JS ne tournent
//     jamais en parallèle, ce qui borne la mémoire consommée sur Railway ;
//   - applique un timeout global de 30 s par usage ;
//   - ferme TOUT dans un finally (jamais de navigateur zombie) ;
//   - journalise durée + mémoire pour surveiller la consommation.

const { chromium } = require('playwright');

const USAGE_TIMEOUT_MS = 30_000;

// User-Agent réaliste (Chrome récent sur Windows), locale et viewport standard.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCALE = 'fr-FR';
const VIEWPORT = { width: 1366, height: 768 };

// Args de lancement pensés pour un conteneur contraint :
//  --no-sandbox              : requis quand le process tourne en root (Docker/Railway)
//  --disable-dev-shm-usage   : évite les crashs quand /dev/shm est minuscule
//  --disable-gpu             : inutile en headless, économise de la mémoire
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

// Permet de pointer vers un Chromium système (ex. fourni par Nix sur Railway).
// Vide en local → Playwright utilise son binaire téléchargé.
const EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

// Mutex : chaîne de promesses. Chaque withPage attend la fin du précédent.
let queue = Promise.resolve();

function formatMem() {
  const mb = (n) => Math.round(n / 1024 / 1024);
  const m = process.memoryUsage();
  return `rss=${mb(m.rss)}Mo heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}Mo`;
}

// Exécute fn(page) dans une page neuve, tout est nettoyé au retour.
async function runOnce(fn) {
  const startedAt = Date.now();
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
      executablePath: EXECUTABLE_PATH,
    });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: LOCALE,
      viewport: VIEWPORT,
    });
    const page = await context.newPage();

    // Timeout global : si fn dépasse 30 s, on rejette (le finally ferme le navigateur).
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timeout headless (>${USAGE_TIMEOUT_MS} ms)`)),
        USAGE_TIMEOUT_MS
      );
    });

    try {
      return await Promise.race([Promise.resolve(fn(page)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    // Fermeture inconditionnelle : jamais de navigateur zombie.
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('[headless] échec fermeture navigateur :', err.message);
      }
    }
    const ms = Date.now() - startedAt;
    console.log(`[headless] usage terminé en ${ms} ms · ${formatMem()}`);
  }
}

/**
 * Point d'entrée mutualisé. Sérialise les usages (un seul navigateur à la fois).
 * @param {(page: import('playwright').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withPage(fn) {
  // On enchaîne sur la queue ; le résultat de fn est renvoyé à l'appelant, mais
  // la queue elle-même ne doit jamais rester « rejetée » (sinon tout se bloque).
  const result = queue.then(() => runOnce(fn));
  queue = result.catch(() => {});
  return result;
}

module.exports = { withPage };
