// scripts/encart-cta-check.js — vérifie le COMPORTEMENT du bouton d'encart (Playwright).
//
//   node scripts/encart-cta-check.js
//
// Hors ligne (aucune base) : un petit serveur mock sert public/ + un /api/sources minimal
// incluant les 3 alertes cibles des encarts. On force chaque encart via ?encart=<id> (autorisé
// hors prod) et on pilote la vraie pile (site.js/cards.js/encarts.js). On vérifie :
//   • CONNECTÉ : clic sur le CTA → POST /api/my-alerts/toggle (le MÊME appel que le switch),
//     AUCUNE navigation, la carte passe data-subscribed=1, et le bouton devient « Abonné ✓ »
//     désactivé. Le switch de la carte reflète l'abonnement.
//   • NON CONNECTÉ : clic sur le CTA → même comportement que le switch (ligne « en attente » +
//     formulaire e-mail ouvert sur la carte), AUCUNE navigation.
'use strict';
const net = require('net');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref(); srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function mockSources() {
  const targets = [
    { id: 'leboncoin-livraison', name: 'Livraison à 0,99 €', categories: ['bons-plans'] },
    { id: 'aurores-france', name: 'Aurores en France', categories: ['astronomie'] },
    { id: 'tache-echeance-glissante', name: 'Tâche à échéance', categories: ['vie-pratique'], type: 'user-task' },
  ].map((t, i) => ({
    id: t.id, name: t.name, subtitle: 'Alerte de démonstration',
    description: 'Jeu de données de test (aucune base).', description_long: null,
    badge: 'official', type: t.type || 'internal', link_url: null, categories: t.categories,
    params_schema: null, likes_count: 50 - i, created_at: new Date(Date.now() - i * 3600000).toISOString(),
    forum_slug: t.id, state: 'active', subscriber_count: 20 - i, topic_count: 0,
  }));
  const cats = [['meteo'], ['bons-plans'], ['securite'], ['transport'], ['sante'], ['culture'], ['environnement'], ['emploi'], ['logement'], ['sport']];
  const demo = cats.map((c, i) => ({
    id: 'demo-' + i, name: 'Alerte démo ' + i, subtitle: 's', description: 'd', description_long: null,
    badge: i % 3 === 0 ? 'official' : 'community', type: 'internal', link_url: null, categories: c,
    params_schema: null, likes_count: (10 - i) * 3, created_at: new Date(Date.now() - i * 86400000).toISOString(),
    forum_slug: 'demo' + i, state: i % 2 === 0 ? 'active' : 'inactive', subscriber_count: 10 - i, topic_count: 0,
  }));
  return targets.concat(demo);
}

function startServer(port) {
  process.env.NODE_ENV = 'development';
  process.env.APP_PLAY_URL_ENABLED = 'false';
  process.env.PUBLISH_ENABLED = 'true';
  ['../server/pages', '../server/app-play-flag', '../server/publish-flag', '../server/encarts'].forEach((m) => {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
  });
  const express = require(ROOT + '/node_modules/express');
  const { pagesMiddleware } = require(ROOT + '/server/pages');
  const app = express();
  const json = (res, body) => { res.type('application/json').send(JSON.stringify(body)); };
  app.get('/api/sources', (req, res) => json(res, mockSources()));
  app.get('/api/stats', (req, res) => json(res, { lines: [] }));
  app.get('/api/collections', (req, res) => json(res, []));
  app.use(pagesMiddleware);
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/api', (req, res) => json(res, {}));
  return new Promise((resolve) => {
    const s = app.listen(port, '127.0.0.1', () => resolve({ port, stop: () => new Promise((r) => s.close(r)) }));
  });
}

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

(async () => {
  let chromium;
  try { ({ chromium } = require(ROOT + '/node_modules/playwright')); }
  catch (e) { console.error('Playwright introuvable (npm i + npx playwright install chromium).'); process.exit(1); }

  const port = await freePort();
  const srv = await startServer(port);
  const base = 'http://127.0.0.1:' + port + '/';
  const browser = await chromium.launch();

  async function openEncart(ctx, query, connected) {
    const page = await ctx.newPage();
    let toggleCalls = 0, navToConnexion = false;
    // Mode connecté : jeton en localStorage + mock de /api/my-alerts et /toggle.
    if (connected) {
      await page.addInitScript(() => { try { localStorage.setItem('lba-token', 't'.repeat(64)); } catch (e) {} });
      await page.route('**/api/my-alerts', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, email: 'demo@labonnealerte.fr', token: 't'.repeat(64), subscriptions: [], mine: [], favorites: [] }) }));
      await page.route('**/api/my-alerts/toggle', (route) => {
        toggleCalls++;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      });
    }
    page.on('framenavigated', (f) => { if (f === page.mainFrame() && /\/connexion/.test(f.url())) navToConnexion = true; });
    await page.goto(base + query, { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.encart.is-placed', { timeout: 8000 }); } catch (e) {}
    await page.waitForTimeout(1200);
    return { page, calls: () => toggleCalls, nav: () => navToConnexion };
  }

  // ── CONNECTÉ : livraison-1e (source simple) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
    const { page, calls } = await openEncart(ctx, '?encart=livraison-1e', true);
    const urlBefore = page.url();
    const cta = page.locator('.encart .encart-cta');
    await cta.waitFor({ timeout: 8000 });
    ok((await cta.evaluate((e) => e.tagName)) === 'BUTTON', 'connecté : CTA est un <button>');
    await cta.click();
    await page.waitForTimeout(1500);
    ok(page.url() === urlBefore, 'connecté : clic CTA → AUCUNE navigation');
    ok(calls() === 1, 'connecté : clic CTA → 1 appel POST /api/my-alerts/toggle (le même que le switch)');
    const card = page.locator('#grid .card[data-source-id="leboncoin-livraison"]');
    ok((await card.getAttribute('data-subscribed')) === '1', 'connecté : la carte cible passe data-subscribed=1');
    ok((await card.locator('.switch-row input[type="checkbox"]').first().isChecked()),
      'connecté : le switch de la carte reflète l’abonnement (coché)');
    const label = (await cta.textContent() || '').trim();
    ok(/Abonné/.test(label), 'connecté : le bouton affiche « Abonné ✓ »');
    ok(await cta.evaluate((e) => e.hasAttribute('disabled')), 'connecté : le bouton est désactivé après succès');
    await ctx.close();
  }

  // ── NON CONNECTÉ : aurores (source simple) → formulaire e-mail, pas de navigation ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
    const { page, nav } = await openEncart(ctx, '?encart=aurores', false);
    const urlBefore = page.url();
    const cta = page.locator('.encart .encart-cta');
    await cta.waitFor({ timeout: 8000 });
    await cta.click();
    await page.waitForTimeout(800);
    ok(page.url() === urlBefore && !nav(), 'non connecté : clic CTA → AUCUNE navigation');
    const card = page.locator('#grid .card[data-source-id="aurores-france"]');
    const pending = await card.locator('.switch-row.pending').count();
    const open = await card.evaluate((c) => c.classList.contains('open'));
    ok(pending === 1 || open, 'non connecté : clic CTA → même invite que le switch (ligne en attente / formulaire ouvert)');
    // Preuve de RÉUTILISATION du switch : l'encart a basculé le vrai switch de la carte en
    // état « en attente » (coché), exactement comme un clic utilisateur sur ce switch. (Le
    // formulaire n'est VISIBLE que si la carte est affichée — ici elle peut être paginée ;
    // c'est le comportement même du switch, cf. « si elle est affichée » de la demande.)
    const swChecked = await page.locator('#grid .card[data-source-id="aurores-france"] .switch-row input[type="checkbox"]').first().isChecked();
    ok(swChecked, 'non connecté : l’encart a bien actionné le switch de la carte (coché, en attente)');
    await ctx.close();
  }

  await browser.close();
  await srv.stop();
  console.log('\n' + passed + ' OK, ' + fails + ' échec(s).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
