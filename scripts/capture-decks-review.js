/* capture-decks-review.js — captures d'ecran pour la revue UX des decks.
 *
 * Produit, en theme CLAIR et SOMBRE, aux largeurs 360 / 768 / 1024 / 1440 px :
 *   - kiosque : une carte retournee sur sa face « deck »
 *   - /mes-decks : grille de tuiles, puis formulaire « creer un deck »
 *   - vue detail d'un deck (avec ses cartes)
 *   - modale de partage LBAShare ouverte sur un deck
 *
 * Auth : ce script NE se connecte PAS a votre place. Fournissez un token de session
 * valide (celui de localStorage['lba-token'] dans votre navigateur connecte) :
 *
 *   BASE_URL=http://localhost:3000 LBA_TOKEN=xxxxxxxx node scripts/capture-decks-review.js
 *
 * BASE_URL par defaut : http://localhost:3000 (lancez `npm start` a cote).
 * Necessite les navigateurs Playwright : `npx playwright install chromium`.
 * Les images sont ecrites dans captures-decks-review/ (non versionne).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.LBA_TOKEN || '';
const OUT = path.join(process.cwd(), 'captures-decks-review');
const WIDTHS = [360, 768, 1024, 1440];
const THEMES = ['light', 'dark'];

if (!TOKEN) {
  console.error('LBA_TOKEN manquant. Exemple :\n  LBA_TOKEN=xxxx BASE_URL=http://localhost:3000 node scripts/capture-decks-review.js');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log('  ✓', path.relative(process.cwd(), file));
}

// Prepare un contexte : token + theme injectes AVANT tout script de page.
async function makeContext(browser, theme, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await context.addInitScript(([tok, th]) => {
    try {
      localStorage.setItem('lba-token', tok);
      localStorage.setItem('lba-theme', th);
    } catch (e) {}
  }, [TOKEN, theme]);
  return context;
}

async function goto(page, route) {
  await page.goto(BASE_URL + route, { waitUntil: 'networkidle' });
  await sleep(500);
}

async function run() {
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const tag = theme + '-' + width;
      console.log('\n== ' + tag + ' ==');
      const context = await makeContext(browser, theme, width);
      const page = await context.newPage();

      // 1) Kiosque : carte retournee sur sa face « deck ».
      try {
        await goto(page, '/');
        const btn = page.locator('.card-add-deck').first();
        await btn.click({ timeout: 8000 });
        await page.waitForSelector('.card.flipped.face-deck', { timeout: 8000 });
        await sleep(700);
        await shot(page, 'kiosque-carte-face-deck_' + tag);
      } catch (e) { console.warn('  ! kiosque face deck :', e.message); }

      // 2) /mes-decks : grille de tuiles.
      try {
        await goto(page, '/mes-decks');
        await sleep(600);
        await shot(page, 'mes-decks-grille_' + tag);
      } catch (e) { console.warn('  ! mes-decks grille :', e.message); }

      // 3) /mes-decks : formulaire de creation.
      try {
        const open = page.locator('#deck-create-open');
        if (await open.count()) {
          await open.click();
          await page.waitForSelector('#deck-form', { timeout: 6000 });
          await sleep(500);
          await shot(page, 'mes-decks-formulaire_' + tag);
        }
      } catch (e) { console.warn('  ! mes-decks formulaire :', e.message); }

      // 4) Vue detail d'un deck (premiere tuile).
      try {
        await goto(page, '/mes-decks');
        const tile = page.locator('.deck-tile').first();
        if (await tile.count()) {
          await tile.click();
          await page.waitForSelector('#deck-grid', { timeout: 6000 });
          await sleep(700);
          await shot(page, 'deck-detail_' + tag);

          // 5) Modale de partage ouverte (sans modifier l'etat de partage).
          try {
            await page.evaluate(() => {
              if (window.LBAShare && window.LBAShare.openModal) {
                window.LBAShare.openModal('Mon deck', 'https://labonnealerte.fr/deck/EXEMPLE');
              }
            });
            await sleep(500);
            await shot(page, 'deck-partage-modale_' + tag);
          } catch (e) { console.warn('  ! modale partage :', e.message); }
        }
      } catch (e) { console.warn('  ! deck detail :', e.message); }

      await context.close();
    }
  }
  await browser.close();
  console.log('\nTermine. Captures dans', path.relative(process.cwd(), OUT));
}

run().catch((e) => { console.error(e); process.exit(1); });
