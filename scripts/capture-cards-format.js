/* capture-cards-format.js — captures d'ecran pour le chantier « format carte a jouer ».
 *
 * Verifie le nouveau ratio 5/7 des cartes du kiosque, la grille adaptative et la
 * troncature de la description, en theme CLAIR et SOMBRE, aux largeurs
 * 1440 / 1024 / 360 px. Pour chaque combinaison : une capture pleine page du
 * kiosque + un gros plan sur les 6 premieres cartes (pour juger le ratio et la
 * troncature au plus pres).
 *
 * Cibles demandees (toutes visibles sur le kiosque public, sans connexion) :
 *   - une carte simple a l'etat « Rien a signaler »
 *   - une carte a description longue (verifier la troncature + le fondu)
 *   - une carte parametree avec <select> (verifier que le ratio ne casse pas)
 *
 * Lancement (npm start a cote, sur http://localhost:3000 par defaut) :
 *   BASE_URL=http://localhost:3000 node scripts/capture-cards-format.js
 *
 * Connexion facultative (affiche l'icone « + deck » sur le recto) :
 *   LBA_TOKEN=xxxx node scripts/capture-cards-format.js
 *
 * Necessite les navigateurs Playwright : npx playwright install chromium.
 * Les images sont ecrites dans captures-cards-format/ (non versionne).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.LBA_TOKEN || '';
const OUT = path.join(process.cwd(), 'captures-cards-format');
const WIDTHS = [1440, 1024, 360];
const THEMES = ['light', 'dark'];

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, locator) {
  const file = path.join(OUT, name + '.png');
  if (locator) {
    await locator.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file, fullPage: true });
  }
  console.log('  ✓', path.relative(process.cwd(), file));
}

async function makeContext(browser, theme, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await context.addInitScript(([tok, th]) => {
    try {
      if (tok) localStorage.setItem('lba-token', tok);
      localStorage.setItem('lba-theme', th);
    } catch (e) {}
  }, [TOKEN, theme]);
  return context;
}

async function run() {
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const tag = theme + '-' + width;
      console.log('\n== ' + tag + ' ==');
      const context = await makeContext(browser, theme, width);
      const page = await context.newPage();

      try {
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
        // Attend que le kiosque soit rendu (au moins une vraie carte, pas un squelette).
        await page.waitForSelector('.grid .card.flip .card-front', { timeout: 10000 });
        await sleep(700);

        // 1) Kiosque pleine page : vue d'ensemble de la grille adaptative.
        await shot(page, 'kiosque-pleine-page_' + tag);

        // 2) Gros plan sur le haut de la grille (ratio + troncature au plus pres).
        const grid = page.locator('.grid').first();
        if (await grid.count()) {
          await shot(page, 'kiosque-grille-haut_' + tag, grid);
        }

        // 3) Carte parametree (celle qui porte un <select> de parametre) : verifier
        //    que le ratio ne casse pas malgre le contenu supplementaire.
        const paramCard = page.locator('.grid .card.flip:has(.param-select), .grid .card.flip:has(.dyn-search)').first();
        if (await paramCard.count()) {
          await paramCard.scrollIntoViewIfNeeded();
          await sleep(200);
          await shot(page, 'carte-parametree_' + tag, paramCard);
        } else {
          console.warn('  ! aucune carte parametree visible sur cette vue');
        }
      } catch (e) {
        console.warn('  ! kiosque :', e.message);
      }

      await context.close();
    }
  }
  await browser.close();
  console.log('\nTermine. Captures dans', path.relative(process.cwd(), OUT));
}

run().catch((e) => { console.error(e); process.exit(1); });
