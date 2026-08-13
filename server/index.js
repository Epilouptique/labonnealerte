require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');
const apiRouter = require('./routes/api');
const devRouter = require('./routes/dev');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { apiRouter: myAlertsApiRouter, pagesRouter: myAlertsPagesRouter } = require('./routes/myalerts');
const authRouter = require('./routes/auth');
const pushRouter = require('./routes/push');
const collectionsRouter = require('./routes/collections');
const decksRouter = require('./routes/decks');
const skinsRouter = require('./routes/skins');
const { apiRouter: lePointApiRouter } = require('./routes/le-point');
const { pagesRouter: userTasksPagesRouter, apiRouter: userTasksApiRouter } = require('./routes/user-tasks');
const forumRouter = require('./routes/forum');
const communityReportsRouter = require('./routes/community-reports');
const { cleanupExpired } = require('./sessions');
const { startPoller } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Un seul proxy devant l'app (Railway) : indispensable pour l'IP réelle du client
// (rate-limiting) sans permettre l'usurpation via X-Forwarded-For.
app.set('trust proxy', 1);
// Désactivé aussi explicitement via helmet (X-Powered-By).
app.disable('x-powered-by');

// ⚠️ DIAGNOSTIC TEMPORAIRE (lot IPv6) — activé UNIQUEMENT si la variable d'env
// LOG_CLIENT_IP=1 est posée sur Railway. Trace les en-têtes d'IP BRUTS pour vérifier si
// Railway transmet l'IPv6 réelle du visiteur (vs une IPv4 traduite par le proxy amont).
// Limité aux requêtes de page (accept text/html) pour ne pas polluer les logs avec les
// assets/API. AUCUN autre effet : pas d'écriture DB, pas de résolution geoip.
// À RETIRER (ou laisser dormant, désactivé par défaut) une fois le diagnostic obtenu.
if (process.env.LOG_CLIENT_IP === '1') {
  const https = require('https');
  const { clientIp } = require('./profile-autofill');

  // Résolution IPLocate PONCTUELLE (diagnostic seul, jamais branchée sur l'inscription).
  // Non bloquante : lancée après next(), logguée quand elle répond. Aucune écriture DB.
  // Clé optionnelle via IPLOCATE_APIKEY (comme scripts/test-iplocate.js) ; sinon keyless.
  function iplocateDiag(ip) {
    const key = process.env.IPLOCATE_APIKEY || '';
    const url = 'https://iplocate.io/api/lookup/' + encodeURIComponent(ip) +
      (key ? '?apikey=' + encodeURIComponent(key) : '');
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(d);
          console.log('[ip-geo-diag]', JSON.stringify({
            ip, country: j.country_code, city: j.city,
            subdivision: j.subdivision, postal: j.postal_code,
            ll: [j.latitude, j.longitude],
          }));
        } catch (e) { console.log('[ip-geo-diag] parse-fail', d.slice(0, 100)); }
      });
    }).on('error', (e) => console.log('[ip-geo-diag] err', e.message));
  }

  app.use((req, res, next) => {
    var ip = null;
    try {
      const accept = String(req.headers['accept'] || '');
      if (accept.includes('text/html')) {
        ip = clientIp(req);
        console.log('[ip-diag]', JSON.stringify({
          path: req.path,
          cfConnectingIp: req.headers['cf-connecting-ip'] || null,
          // true = requête réellement passée par Cloudflare (secret partagé valide).
          originSecretOk: !!(process.env.ORIGIN_SECRET && req.headers['x-origin-secret'] === process.env.ORIGIN_SECRET),
          xff: req.headers['x-forwarded-for'] || null,
          xRealIp: req.headers['x-real-ip'] || null,
          remote: (req.socket && req.socket.remoteAddress) || null,
          reqIp: req.ip,
          clientIp: ip,
        }));
      }
    } catch (e) { /* non bloquant */ }
    next();
    // Après next() → ne retarde jamais la réponse. Seulement si une IP publique est retenue.
    if (ip) { try { iplocateDiag(ip); } catch (e) { /* non bloquant */ } }
  });
}

// B) En-têtes de sécurité + Content-Security-Policy adaptée au site.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // Polices auto-hébergées (RGPD, aucune requête vers Google) : /css/fonts.css
      // + /fonts/*.woff2. 'unsafe-inline' pour les attributs style= et blocs <style>.
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'"],
      'script-src': ["'self'"], // aucun script inline (tous externalisés)
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      // PWA : service worker et manifeste, même origine.
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
    },
  },
}));

app.use(express.json());

// PWA — servis explicitement AVANT le static pour maîtriser les en-têtes.
const publicDir = path.join(__dirname, '..', 'public');
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(publicDir, 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.type('application/javascript');
  // Autorise un scope racine et force la revalidation (mises à jour du SW).
  res.set('Service-Worker-Allowed', '/');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'sw.js'));
});

app.use(express.static('public'));

// C) Limiteur global sur /api : 120 requêtes/minute/IP (la home fait plusieurs appels).
//    Les limiteurs stricts (subscribe, my-alerts, dev) restent actifs en plus.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
});
app.use('/api', apiLimiter);

app.use('/api', apiRouter);
app.use('/api', subscribeApiRouter);
app.use('/api', myAlertsApiRouter);
app.use('/api', pushRouter);
app.use('/api', collectionsRouter);
app.use('/api', decksRouter);
app.use('/api', skinsRouter);
app.use('/api', lePointApiRouter);
app.use('/api', userTasksApiRouter);
app.use('/api', communityReportsRouter);
app.use('/api/dev', devRouter);
// Connexion OAuth (Google / GitHub) — redirections serveur.
app.use('/auth', authRouter);
// Page développeur « Proposer une source » (palette Veille de nuit).
app.get('/proposer', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'proposer.html'));
});
// Pages statiques simples.
app.get('/a-propos', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'a-propos.html'));
});
app.get('/soutenir', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'soutenir.html'));
});
app.get('/mentions-legales', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mentions-legales.html'));
});
app.get('/confidentialite', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'confidentialite.html'));
});

app.get('/le-point', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'le-point.html'));
});

// Fusion v2 (vague 12) : anciens ids broadcast → source paramétrée (qs = query
// string vers la combinaison équivalente ; vide = page source sans préréglage).
const FUSED_REDIRECTS = {
  'vigieau-gap': { to: 'vigieau', qs: 'commune=05061' },
  'vacances-zone-a': { to: 'vacances-scolaires', qs: 'zone=A' },
  'vacances-zone-b': { to: 'vacances-scolaires', qs: 'zone=B' },
  'vacances-zone-c': { to: 'vacances-scolaires', qs: 'zone=C' },
  'carburant-seuils': { to: 'carburant', qs: '' },
  'indice-uv-gap': { to: 'indice-uv', qs: 'departement=05' },
};

// Page « Mes decks » (gestion des decks utilisateur) — contenu chargé côté client.
app.get('/mes-decks', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mes-decks.html'));
});
// Page « Nouveau deck » : meme SPA (mes-decks.html) ; decks.js detecte le chemin et ouvre
// directement le formulaire de creation (le lien « Ajouter un deck » pointe ici).
app.get('/mes-decks/nouveau', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mes-decks.html'));
});

// Page « Boutique » (skins cosmetiques, phase 3) — contenu chargé côté client.
app.get('/boutique', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'boutique.html'));
});

// « Mes favoris » n'est plus une PAGE mais un FILTRE du kiosque (comme « Ma collection ») :
// transition immédiate entre cartes, sans changement de page. La route est conservée en
// REDIRECTION — les favoris étaient marquables en signet et le lien ❤ pointait ici depuis
// le lancement. 302 VOLONTAIRE (pas 301) : une 301 se grave dans le cache des navigateurs,
// donc irréversible côté visiteur si l'on rétablissait la page. public/favoris.html et
// js/favoris*.js restent dans le dépôt mais ne sont plus atteignables par aucun lien.
app.get('/favoris', (req, res) => {
  res.redirect(302, '/?mode=favoris');
});

// Page publique d'un deck partagé : /deck/:token. SEO PRUDENT (anti-spam d'aperçu) :
// og:title = nom du deck (déjà validé à la saisie) ; og:description = description
// GÉNÉRIQUE du site (JAMAIS la description libre de l'utilisateur). 404 propre.
app.get('/deck/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT name, emoji FROM collections WHERE share_token = $1 AND visibility IN ('public', 'unlisted')",
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Deck introuvable</title>' +
        '<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;text-align:center;color:#0f1419">' +
        '<h1>Deck introuvable</h1><p>Ce lien de partage n\'est plus valable.</p>' +
        '<p><a href="/" style="color:#a567e3;font-weight:600">← Retour au kiosque</a></p></body>'
      );
    }
    const d = rows[0];
    const emoji = d.emoji ? d.emoji + ' ' : '';
    const title = `${emoji}${d.name} — un deck · La Bonne Alerte`;
    // Description GÉNÉRIQUE (pas la description libre de l'utilisateur).
    const desc = 'Un deck d\'alertes partagé sur La Bonne Alerte — adoptez-le en un clic (copie privée).';
    const url = `https://labonnealerte.fr/deck/${encodeURIComponent(req.params.token)}`;

    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'deck.html'), 'utf8');
    html = html
      .replace(/\{\{TITLE\}\}/g, escHtml(title))
      .replace(/\{\{DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_TITLE\}\}/g, escHtml(`${emoji}${d.name} — La Bonne Alerte`))
      .replace(/\{\{OG_DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_URL\}\}/g, escHtml(url));
    res.type('html').send(html);
  } catch (err) {
    console.error('[server] Erreur /deck/:token :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});

// Page de statut d'une source : SEO injecté côté serveur + 404 propre.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Page publique d'une collection : /collection/:slug — SEO injecté côté serveur
// (og:title/description propres, partageable) + 404 propre. Le contenu (cartes,
// bouton « Adopter ») est chargé côté client via GET /api/collections/:slug.
app.get('/collection/:slug', async (req, res) => {
  const slug = req.params.slug;
  try {
    const { rows } = await pool.query(
      "SELECT name, description, emoji FROM collections WHERE id = $1 AND visibility = 'official' AND owner_subscriber_id IS NULL",
      [slug]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Collection introuvable</title>' +
        '<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;text-align:center;color:#0f1419">' +
        '<h1>Collection introuvable</h1><p>Cette collection n\'existe pas ou n\'est plus disponible.</p>' +
        '<p><a href="/" style="color:#a567e3;font-weight:600">← Retour au kiosque</a></p></body>'
      );
    }
    const c = rows[0];
    const emoji = c.emoji ? c.emoji + ' ' : '';
    const title = `${emoji}${c.name} — une collection · La Bonne Alerte`;
    const desc = (c.description || `La collection « ${c.name} » : un pack d'alertes prêt à adopter en un clic.`).slice(0, 180);
    const url = `https://labonnealerte.fr/collection/${encodeURIComponent(slug)}`;

    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'collection.html'), 'utf8');
    html = html
      .replace(/\{\{TITLE\}\}/g, escHtml(title))
      .replace(/\{\{DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_TITLE\}\}/g, escHtml(`${emoji}${c.name} — La Bonne Alerte`))
      .replace(/\{\{OG_DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_URL\}\}/g, escHtml(url));
    res.type('html').send(html);
  } catch (err) {
    console.error('[server] Erreur /collection/:slug :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});
app.get('/source/:id/statut', async (req, res) => {
  const id = req.params.id;
  // Fusion v2 : anciennes vigilances départementales → page paramétrée (SEO 301).
  const oldVig = id.match(/^vigilance-meteo-(.+)$/);
  if (oldVig) {
    return res.redirect(301, '/source/vigilance-meteo/statut?departement=' + encodeURIComponent(oldVig[1]));
  }
  // Fusion v2 (vague 12) : sources broadcast retirées → source paramétrée (SEO 301).
  const fused = FUSED_REDIRECTS[id];
  if (fused) {
    return res.redirect(301, `/source/${fused.to}/statut${fused.qs ? '?' + fused.qs : ''}`);
  }
  try {
    const { rows } = await pool.query(
      'SELECT name, subtitle, description FROM sources WHERE id = $1 AND enabled = true',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Source introuvable</title>' +
        '<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;text-align:center;color:#0f1419">' +
        '<h1>Source introuvable</h1><p>Cette source n\'existe pas ou n\'est plus disponible.</p>' +
        '<p><a href="/" style="color:#a567e3;font-weight:600">← Retour au kiosque</a></p></body>'
      );
    }
    const s = rows[0];
    const title = `${s.name} — statut & historique · La Bonne Alerte`;
    const desc = (s.subtitle || s.description || `Statut de surveillance de « ${s.name} ».`).slice(0, 180);
    const url = `https://labonnealerte.fr/source/${encodeURIComponent(id)}/statut`;

    let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'source.html'), 'utf8');
    html = html
      .replace(/\{\{TITLE\}\}/g, escHtml(title))
      .replace(/\{\{DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_TITLE\}\}/g, escHtml(s.name + ' — statut'))
      .replace(/\{\{OG_DESC\}\}/g, escHtml(desc))
      .replace(/\{\{OG_URL\}\}/g, escHtml(url));
    res.type('html').send(html);
  } catch (err) {
    console.error('[server] Erreur /source/:id/statut :', err.message);
    res.status(503).type('html').send('Service momentanément indisponible.');
  }
});
// Forum communautaire maison : pages HTML server-rendues (/forum) + écritures
// JSON (auth via authenticate(token)) + endpoint compteur (/api/forum/...).
// Monté à la racine ; les chemins /api/forum/* passent quand même par
// l'apiLimiter global (app.use('/api', ...) posé plus haut).
app.use('/', forumRouter);

// Pages HTML (liens email) montées à la racine, après le static.
app.use('/', pagesRouter);
app.use('/', myAlertsPagesRouter);
app.use('/', userTasksPagesRouter);

app.listen(PORT, () => {
  console.log(`[server] Écoute sur http://localhost:${PORT}`);
  cleanupExpired(); // purge des sessions expirées au démarrage
  startPoller();
});
