// scripts/capture-accueil.js — captures de l'accueil NON CONNECTÉ (Playwright).
//
// À LANCER EN LOCAL par Hugo :  node scripts/capture-accueil.js
//
// Produit 8 PNG de l'accueil anonyme : {desktop|mobile} × {clair|sombre} × APP_PLAY_URL_ENABLED
// {false|true}. Les images vont dans un dossier HORS dépôt : ../captures-accueil/ (à côté du
// dépôt), et leurs chemins sont affichés à la fin.
//
// SOURCE DES DONNÉES (dans l'ordre) :
//   1) ta base de DEV/LOCALE : si DATABASE_URL est défini (via .env) et ne pointe PAS vers la
//      prod (Railway), on démarre le vrai serveur (server/index.js) contre cette base ;
//   2) sinon (ou avec --mock) : un petit serveur de test autonome qui sert public/ + un MOCK
//      minimal de /api/sources (≈10 alertes), /api/stats et /api/collections — aucune base.
// GARDE-FOU : on ne démarre JAMAIS le vrai serveur si DATABASE_URL ressemble à la prod
// (railway/rlwy). On ne touche ni à Railway ni à la base de prod.
//
// Prérequis navigateur : Playwright est installé ; si le binaire Chromium manque, lancer une
// fois `npx playwright install chromium`.
'use strict';
require('dotenv').config();

const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Mode « encarts » (--encarts) : force tour à tour chaque encart via ?encart=<id> et écrit
// dans ../captures-encarts/. Sinon : captures de l'accueil (APP_PLAY on/off) dans ../captures-accueil/.
const ENCART_MODE = process.argv.includes('--encarts');
const ENCART_IDS = ['livraison-1e', 'aurores', 'echeances'];
const OUT_DIR = process.env.CAPTURE_OUT || path.join(ROOT, '..', ENCART_MODE ? 'captures-encarts' : 'captures-accueil');
const PUBLISH = process.env.PUBLISH_ENABLED || 'true'; // défaut : montrer la carte « Publier » (comme en prod)
const FORCE_MOCK = process.argv.includes('--mock') || process.env.CAPTURE_MOCK === '1';

// ── Détection prod : on refuse d'ouvrir le vrai serveur sur une base Railway/prod ──
function looksLikeProd(url) {
  return /railway|rlwy\.net|\.rlwy\.|proxy\.rlwy|containers-us-west/i.test(String(url || ''));
}
const DB = process.env.DATABASE_URL || '';
const USE_REAL = !FORCE_MOCK && DB && !looksLikeProd(DB);
if (!FORCE_MOCK && DB && looksLikeProd(DB)) {
  console.warn('⚠ DATABASE_URL ressemble à la PROD (Railway) : on NE démarre PAS le vrai serveur.');
  console.warn('  → bascule sur le serveur de test (mock /api/sources). Aucune base touchée.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function waitHttpReady(port, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 25000);
  return new Promise((resolve, reject) => {
    (function poll() {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
        res.resume(); resolve();
      });
      req.on('error', () => { if (Date.now() > deadline) reject(new Error('serveur non prêt')); else setTimeout(poll, 400); });
      req.on('timeout', () => { req.destroy(); if (Date.now() > deadline) reject(new Error('timeout')); else setTimeout(poll, 400); });
    })();
  });
}

// ── Jeu de données de test minimal (mock) : forme suffisante pour cards.js ──
// Inclut les 3 alertes CIBLES des encarts (leboncoin-livraison, aurores-france,
// tache-echeance-glissante) pour que les encarts soient éligibles dans les captures.
function mockSources() {
  const targets = [
    { id: 'leboncoin-livraison', name: 'Livraison à 0,99 €', categories: ['bons-plans'] },
    { id: 'aurores-france', name: 'Aurores en France', categories: ['astronomie'] },
    { id: 'tache-echeance-glissante', name: 'Tâche à échéance', categories: ['vie-pratique'], type: 'user-task' },
  ].map((t, i) => ({
    id: t.id, name: t.name, subtitle: 'Alerte de démonstration',
    description: 'Jeu de données de test pour les captures (aucune base). Contenu factice.',
    description_long: null, badge: 'official', type: t.type || 'internal', link_url: null,
    categories: t.categories, params_schema: null, likes_count: 50 - i,
    created_at: new Date(Date.now() - i * 3600000).toISOString(), forum_slug: t.id,
    state: 'active', subscriber_count: 20 - i, topic_count: 0,
  }));
  const cats = [['meteo'], ['bons-plans', 'jeux-video'], ['securite'], ['transport'],
    ['sante'], ['culture'], ['environnement'], ['emploi'], ['logement'], ['sport']];
  const noms = ['Vigilance météo', 'Jeu gratuit Epic', 'Alertes CERT-FR', 'Grèves transport',
    'Rappels produits', 'Sorties ciné', 'Qualité de l’air', 'Concours fonction publique',
    'Nouvelles annonces', 'Billetterie match'];
  const demo = noms.map((name, i) => ({
    id: 'demo-' + i,
    name: name,
    subtitle: 'Alerte de démonstration',
    description: 'Jeu de données de test pour les captures (aucune base). Contenu factice.',
    description_long: null,
    badge: i % 3 === 0 ? 'official' : 'community',
    type: 'internal',
    link_url: null,
    categories: cats[i] || [],
    params_schema: null,
    likes_count: (10 - i) * 3,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    forum_slug: 'demo' + i,
    state: i % 2 === 0 ? 'active' : 'inactive',
    subscriber_count: (10 - i),
    topic_count: 0,
  }));
  return targets.concat(demo);
}

// ── Serveur de test autonome (mock) : public/ + pages.js + endpoints factices ──
function startMockServer(port, appPlayEnabled) {
  process.env.APP_PLAY_URL_ENABLED = appPlayEnabled ? 'true' : 'false';
  process.env.PUBLISH_ENABLED = PUBLISH;
  process.env.NODE_ENV = 'development'; // pages.js relit les drapeaux à chaque requête
  // Require TARDIF + cache purgé : pages.js lit les drapeaux au chargement du module.
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'pages.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'app-play-flag.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'publish-flag.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'encarts.js'))];
  const express = require('express');
  const { pagesMiddleware } = require(path.join(ROOT, 'server', 'pages.js'));
  const app = express();
  const json = (res, body) => { res.type('application/json').send(JSON.stringify(body)); };
  app.get('/api/sources', (req, res) => json(res, mockSources()));
  app.get('/api/stats', (req, res) => json(res, { lines: [] }));
  app.get('/api/collections', (req, res) => json(res, []));
  app.use(pagesMiddleware);                       // / et *.html (injecte les drapeaux sur <html>)
  app.use(express.static(path.join(ROOT, 'public'))); // css/js/img/fonts…
  app.use('/api', (req, res) => json(res, {}));   // tout le reste de l'API : vide (anon)
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => resolve({ stop: () => new Promise((r) => server.close(r)) }));
  });
}

// ── Vrai serveur (server/index.js) contre la base locale, en process enfant ──
function startRealServer(port, appPlayEnabled) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      APP_PLAY_URL_ENABLED: appPlayEnabled ? 'true' : 'false',
      PUBLISH_ENABLED: PUBLISH,
      NODE_ENV: 'development',
    }),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return waitHttpReady(port, 25000)
    .then(() => ({ stop: () => { try { child.kill(); } catch (e) {} return Promise.resolve(); } }))
    .catch((e) => { try { child.kill(); } catch (_) {} throw e; });
}

async function startServer(port, appPlayEnabled) {
  if (USE_REAL) {
    try { return await startRealServer(port, appPlayEnabled); }
    catch (e) { console.warn('⚠ vrai serveur indisponible (' + e.message + ') → mock.'); }
  }
  return startMockServer(port, appPlayEnabled);
}

const SHOTS = [
  { key: 'desktop-clair', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { key: 'desktop-sombre', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
  { key: 'mobile-clair', viewport: { width: 390, height: 844 }, colorScheme: 'light', dsf: 2 },
  { key: 'mobile-sombre', viewport: { width: 390, height: 844 }, colorScheme: 'dark', dsf: 2 },
];

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { console.error('Playwright introuvable. `npm i` puis `npx playwright install chromium`.'); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Source des données : ' + (USE_REAL ? 'vrai serveur (base locale ' + DB.replace(/:[^:@/]*@/, ':***@') + ')' : 'serveur de test (mock, aucune base)'));
  console.log('PUBLISH_ENABLED=' + PUBLISH + ' · sortie : ' + OUT_DIR + '\n');

  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { console.error('Chromium non lancé : ' + e.message + '\n→ `npx playwright install chromium`'); process.exit(1); }

  const written = [];

  async function shoot(base, s, query, file) {
    const ctx = await browser.newContext({
      viewport: s.viewport, colorScheme: s.colorScheme, deviceScaleFactor: s.dsf || 1,
    });
    const page = await ctx.newPage();
    await page.goto(base + (query || ''), { waitUntil: 'networkidle' });
    // Accueil ANONYME : aucun jeton en contexte neuf → mode anon. On attend le rendu.
    try { await page.waitForSelector('body[data-mode="anon"]', { timeout: 8000 }); } catch (e) {}
    try { await page.waitForSelector('#grid .card.flip', { timeout: 8000 }); } catch (e) {}
    if (query && /encart=/.test(query)) {
      try { await page.waitForSelector('.encart.is-placed', { timeout: 6000 }); } catch (e) {}
      await page.waitForTimeout(3600); // laisser les re-placements successifs stabiliser l'encart
    } else {
      await page.waitForTimeout(1400); // masonry mixte (mesures différées) + polices
    }
    await page.screenshot({ path: file, fullPage: true });
    written.push(file);
    await ctx.close();
  }

  if (ENCART_MODE) {
    // Un seul serveur (mock), forçage de chaque encart via ?encart=<id> (autorisé hors prod).
    const port = await freePort();
    const srv = await startServer(port, false);
    const base = 'http://127.0.0.1:' + port + '/';
    try {
      for (const id of ENCART_IDS) {
        for (const s of SHOTS) {
          await shoot(base, s, '?encart=' + id, path.join(OUT_DIR, 'encart-' + id + '-' + s.key + '.png'));
        }
      }
    } finally { await srv.stop(); }
  } else {
    for (const appPlay of [false, true]) {
      const port = await freePort();
      const srv = await startServer(port, appPlay);
      const base = 'http://127.0.0.1:' + port + '/';
      try {
        for (const s of SHOTS) {
          await shoot(base, s, '', path.join(OUT_DIR, 'accueil-' + s.key + '-play-' + (appPlay ? 'on' : 'off') + '.png'));
        }
      } finally { await srv.stop(); }
    }
  }
  await browser.close();

  console.log('\n' + written.length + ' captures écrites :');
  written.forEach((f) => console.log('  ' + path.resolve(f)));
  console.log('\nDossier : ' + path.resolve(OUT_DIR) + '  (hors dépôt)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
