/* capture-decks-ribbon.js — captures du chantier « bandeau-deck en ruban ».
 *
 * Nouveau visuel de deck : pile de cartes 5/7 + ruban teinte centre, avec
 * feuilletage au survol/tap (LBADeckStack). Captures en theme CLAIR et SOMBRE,
 * desktop 1440 et mobile 360.
 *
 *  - Etagere de la home (#collections-shelf) : ANONYME, toujours dispo. Montre les
 *    piles a 3 cartes + ruban. Une variante avec une carte du fond « feuilletee ».
 *  - /mes-decks (grille de tuiles), formulaire de creation, page detail d'un deck :
 *    necessitent un token de session (compte connecte). Les etats « 3+ / 1 / 0 carte »
 *    dependent des decks du compte fourni.
 *
 * Lancement :
 *   BASE_URL=http://localhost:3000 node scripts/capture-decks-ribbon.js
 *   (facultatif, pour les vues connectees) LBA_TOKEN=xxxx BASE_URL=... node scripts/capture-decks-ribbon.js
 *
 * BASE_URL par defaut : http://localhost:3000 (lancez `npm start` a cote).
 * Necessite les navigateurs Playwright : npx playwright install chromium.
 * Images ecrites dans captures-decks-ribbon/ (non versionne).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.LBA_TOKEN || '';
const OUT = path.join(process.cwd(), 'captures-decks-ribbon');
const WIDTHS = [1440, 360];
const THEMES = ['light', 'dark'];

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(target, name) {
  const file = path.join(OUT, name + '.png');
  await target.screenshot({ path: file });
  console.log('  ✓', path.relative(process.cwd(), file));
}

async function makeContext(browser, theme, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme,
  });
  await context.addInitScript(([tok, th]) => {
    try { if (tok) localStorage.setItem('lba-token', tok); localStorage.setItem('lba-theme', th); } catch (e) {}
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

      // 1) Etagere home (anonyme).
      try {
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
        await page.waitForSelector('.deck-stack', { state: 'attached', timeout: 10000 });
        await sleep(900);
        await shot(page.locator('#collections-shelf'), 'etagere_' + tag);
        // Variante feuilletee : on tape une carte du fond du 1er pack.
        await page.evaluate(() => {
          var b = document.querySelector('.deck-stack .ds-i1'); if (b) b.click();
        });
        await sleep(500);
        await shot(page.locator('#collections-shelf'), 'etagere-feuillete_' + tag);
      } catch (e) { console.warn('  ! etagere :', e.message); }

      // 2) Vues connectees (si token).
      if (TOKEN) {
        try {
          await page.goto(BASE_URL + '/mes-decks', { waitUntil: 'networkidle' });
          await sleep(800);
          await shot(page, 'mes-decks-grille_' + tag);
        } catch (e) { console.warn('  ! mes-decks grille :', e.message); }
        try {
          const open = page.locator('#deck-create-open');
          if (await open.count()) {
            await open.click();
            await page.waitForSelector('#deck-preview', { timeout: 6000 });
            await sleep(500);
            await shot(page, 'mes-decks-formulaire_' + tag);
          }
        } catch (e) { console.warn('  ! formulaire :', e.message); }
        try {
          await page.goto(BASE_URL + '/mes-decks', { waitUntil: 'networkidle' });
          const tile = page.locator('.deck-tile').first();
          if (await tile.count()) {
            await tile.click();
            await page.waitForSelector('.coll-head-top .deck-stack', { timeout: 6000 });
            await sleep(600);
            await shot(page, 'deck-detail_' + tag);
          }
        } catch (e) { console.warn('  ! deck detail :', e.message); }
      }

      await context.close();
    }
  }
  await browser.close();
  console.log('\nTermine. Captures dans', path.relative(process.cwd(), OUT));
  if (!TOKEN) console.log('(LBA_TOKEN non fourni : seules les captures d\'etagere anonyme ont ete prises.)');
}

run().catch((e) => { console.error(e); process.exit(1); });
