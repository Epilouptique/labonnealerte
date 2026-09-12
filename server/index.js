require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { authTransport } = require('./auth-transport');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');
const apiRouter = require('./routes/api');
const devRouter = require('./routes/dev');
const { apiRouter: subscribeApiRouter, pagesRouter } = require('./routes/subscribe');
const { apiRouter: myAlertsApiRouter, pagesRouter: myAlertsPagesRouter } = require('./routes/myalerts');
const authRouter = require('./routes/auth');
const pushRouter = require('./routes/push');
// Routeurs decks / collections / skins : ARCHIVÉS (fil #9, 12/09/2026) — non montés.
const { apiRouter: lePointApiRouter } = require('./routes/le-point');
const { pagesRouter: userTasksPagesRouter, apiRouter: userTasksApiRouter } = require('./routes/user-tasks');
const forumRouter = require('./routes/forum');
const communityReportsRouter = require('./routes/community-reports');
const sitemapRouter = require('./routes/sitemap');
const { cleanupExpired } = require('./sessions');
const { startPoller } = require('./poller');
const { sendPage, renderPage, pagesMiddleware } = require('./pages');

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

// TRANSPORT DU JETON — monté ici, APRES express.json() (il complète req.body) et AVANT
// toute route. Lit Authorization: Bearer et le recopie là où les routes cherchent déjà
// le token ; pose Cache-Control: private, no-store sur toute requête authentifiée.
// Point unique : aucune des 37 routes qui appellent authenticate() n'a eu à changer.
app.use(authTransport);

// PWA — servis explicitement AVANT le static pour maîtriser les en-têtes.
const publicDir = path.join(__dirname, '..', 'public');
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(publicDir, 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/');
  // CACHE DU SERVICE WORKER — mesure du 10/09/2026, cause racine d'un bug reel :
  // un navigateur executait encore l'ANCIEN session.js apres le deploiement du lot C.
  // /sw.js etait servi au navigateur avec Cache-Control: max-age=14400 (QUATRE HEURES),
  // donc un bump de CACHE_VERSION n'etait meme pas DETECTE pendant 4 h.
  //
  // ATTENTION, l'origine n'etait PAS la coupable : elle envoyait deja 'no-cache'
  // (verifie en local sur ce meme code). C'est CLOUDFLARE qui reecrivait l'en-tete, via
  // son reglage Browser Cache TTL = 4 h, applique a tout ce qu'il met en cache
  // (cf-cache-status: REVALIDATED). Les assets /js/*, /css/* subissent la meme reecriture.
  //
  // Le seul levier cote origine est de rendre la reponse NON CACHEABLE pour Cloudflare :
  // 'no-store' l'empeche de la mettre en cache, donc de lui appliquer son TTL, et les
  // en-tetes d'origine repassent tels quels. 'no-cache' seul ne suffisait pas : une
  // reponse no-cache reste cacheable-avec-revalidation pour Cloudflare.
  // Un service worker est fait pour etre re-telecharge a chaque controle de mise a jour :
  // no-store n'a aucun cout ici.
  // cacheControl: false -> on garde la main, sendFile ne repose pas son propre en-tete.
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(publicDir, 'sw.js'), { cacheControl: false });
});

// Sitemap XML genere a la volee (avant le static : aucun fichier a servir).
app.use('/', sitemapRouter);

// Cache navigateur des assets statiques. Cloudflare est passe sur  Respect Existing
// Headers  : l'origine reprend la main sur la duree de cache. Sans maxAge,
// express.static envoie public, max-age=0, ce qui fait revalider ~40 fichiers a
// CHAQUE chargement de page. 60 s : plus aucune revalidation pendant une minute de
// navigation, et une peremption bornee a 60 s apres un deploiement.
// La route /sw.js ci-dessus n'est pas concernee : elle est servie AVANT ce static et
// garde son propre no-store + cacheControl: false.
// Pages HTML assemblees (footer commun injecte, cf. server/pages.js) : / et /xxx.html
// passent ici AVANT le static, qui les servirait sinon avec le marqueur brut.
app.use(pagesMiddleware);
app.use(express.static('public', { maxAge: '60s' }));

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
// (routeurs decks / collections / skins archivés — fil #9)
app.use('/api', lePointApiRouter);
app.use('/api', userTasksApiRouter);
app.use('/api', communityReportsRouter);
app.use('/api/dev', devRouter);
// Connexion OAuth (Google / GitHub) — redirections serveur.
app.use('/auth', authRouter);
// Page développeur « Proposer une source » (palette Veille de nuit).
app.get('/proposer', (req, res) => {
  sendPage(res, 'proposer.html');
});
// Pages statiques simples.
app.get('/a-propos', (req, res) => {
  sendPage(res, 'a-propos.html');
});
app.get('/soutenir', (req, res) => {
  sendPage(res, 'soutenir.html');
});
app.get('/mentions-legales', (req, res) => {
  sendPage(res, 'mentions-legales.html');
});
app.get('/confidentialite', (req, res) => {
  sendPage(res, 'confidentialite.html');
});

app.get('/le-point', (req, res) => {
  sendPage(res, 'le-point.html');
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

// Pages /mes-decks, /mes-decks/nouveau, /boutique : ARCHIVÉES (fil #9, 12/09/2026) — routes retirées.

// « Mes favoris » n'est plus une PAGE mais un FILTRE du kiosque (comme « Ma collection ») :
// transition immédiate entre cartes, sans changement de page. La route est conservée en
// REDIRECTION — les favoris étaient marquables en signet et le lien ❤ pointait ici depuis
// le lancement. 302 VOLONTAIRE (pas 301) : une 301 se grave dans le cache des navigateurs,
// donc irréversible côté visiteur si l'on rétablissait la page. public/favoris.html et
// js/favoris*.js restent dans le dépôt mais ne sont plus atteignables par aucun lien.
app.get('/favoris', (req, res) => {
  res.redirect(302, '/?mode=favoris');
});

// Page publique /deck/:token : ARCHIVÉE (fil #9, 12/09/2026) — route retirée.

// Page de statut d'une source : SEO injecté côté serveur + 404 propre.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Page publique /collection/:slug : ARCHIVÉE (fil #9, 12/09/2026) — route retirée.
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

    let html = renderPage('source.html');
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
