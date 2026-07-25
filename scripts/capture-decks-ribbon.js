/* capture-decks-ribbon.js — captures du chantier deck-stack (iteration 2).
 *
 * Les decks sont desormais des tuiles PLEINE TAILLE melangees dans la grille du
 * kiosque : pile de 3 vraies cartes (LBACards.cardHTML) + ruban teinte centre, meme
 * ratio 5/7 et meme largeur de colonne que les cartes d'alerte. Captures en theme
 * CLAIR et SOMBRE, desktop 1440 et mobile 360.
 *
 *  - Kiosque home (#grid) : ANONYME, toujours dispo. Tuiles-deck melangees aux cartes.
 *  - Page detail d'une collection (/collection/pack-essentiel) : ANONYME. En-tete avec
 *    la pile pleine taille (ruban sans nom, le <h1> porte le nom).
 *  - /mes-decks (grille pleine taille) + formulaire de creation : necessitent un token
 *    de session (compte connecte) → captures prises seulement si LBA_TOKEN est fourni.
 *
 * Lancement :
 *   BASE_URL=http://localhost:3000 node scripts/capture-decks-ribbon.js
 *   (vues connectees)  LBA_TOKEN=xxxx BASE_URL=... node scripts/capture-decks-ribbon.js
 *
 * Necessite les navigateurs Playwright : npx playwright install chromium.
 * Images ecrites dans captures-decks-ribbon/ (non versionne).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Controle anti-regression : detecte l'effondrement de largeur (bug « une lettre par
// ligne » → titre interne tres etroit) et confirme la contenance stricte (overflow:hidden
// sur chaque tuile) + l'absence de scroll horizontal de page.
async function checkDecks(page) {
  return page.evaluate(() => {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.deck-card'));
    var minH3 = Infinity, allHidden = true;
    cards.forEach(function (dc) {
      if (getComputedStyle(dc).overflow !== 'hidden') allHidden = false;
      dc.querySelectorAll('.card-top h3').forEach(function (h) {
        minH3 = Math.min(minH3, Math.round(h.getBoundingClientRect().width));
      });
    });
    return {
      deckCards: cards.length,
      minInnerTitleWidthPx: cards.length ? minH3 : -1, // doit rester > ~30 (pas d'effondrement)
      allTilesClipped: allHidden,
      bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });
}

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
    viewport: { width, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme,
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

      // 1) Kiosque : tuiles-deck melangees aux cartes. Pleine page (haut de grille).
      try {
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
        await page.waitForSelector('.deck-card[data-deck-tile] .ds-face .card-front', { timeout: 10000 });
        await sleep(1200);
        await shot(page, 'kiosque-decks-melanges_' + tag);
        console.log('    grille:', JSON.stringify(await checkDecks(page)));
      } catch (e) { console.warn('  ! kiosque :', e.message); }

      // 2) Detail d'une collection (anonyme) : en-tete avec pile pleine taille.
      try {
        await page.goto(BASE_URL + '/collection/pack-essentiel', { waitUntil: 'networkidle' });
        await page.waitForSelector('.coll-head-top .deck-card .ds-face', { timeout: 8000 });
        await sleep(500);
        await shot(page.locator('.coll-head'), 'collection-detail_' + tag);
        console.log('    detail:', JSON.stringify(await checkDecks(page)));
      } catch (e) { console.warn('  ! collection detail :', e.message); }

      // 3) Vues connectees (si token) : grille Mes decks + formulaire.
      if (TOKEN) {
        try {
          await page.goto(BASE_URL + '/mes-decks', { waitUntil: 'networkidle' });
          await sleep(1500);
          await shot(page, 'mes-decks-grille_' + tag);
          console.log('    mes-decks:', JSON.stringify(await checkDecks(page)));
        } catch (e) { console.warn('  ! mes-decks :', e.message); }
        try {
          const open = page.locator('#deck-create-open');
          if (await open.count()) {
            await open.click();
            await page.waitForSelector('#deck-preview', { timeout: 6000 });
            await sleep(600);
            await shot(page, 'mes-decks-formulaire_' + tag);
          }
        } catch (e) { console.warn('  ! formulaire :', e.message); }
      }

      await context.close();
    }
  }
  await browser.close();
  console.log('\nTermine. Captures dans', path.relative(process.cwd(), OUT));
  if (!TOKEN) console.log('(LBA_TOKEN non fourni : Mes decks / formulaire non captures.)');
}

run().catch((e) => { console.error(e); process.exit(1); });
