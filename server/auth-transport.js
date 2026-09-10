// TRANSPORT du jeton de session : ou le serveur va le chercher dans la requete.
//
// POURQUOI. Le jeton de session (64 hex, 90 jours, expiration glissante) voyageait en
// QUERY STRING : GET /api/my-alerts?token=<jeton>. Une query string atterrit dans les
// journaux d'acces Railway, dans les journaux Cloudflare, dans l'historique du
// navigateur, dans la cle de cache de tout edge cache, et dans n'importe quelle capture
// de l'onglet Reseau. La seule protection etait l'en-tete Referrer-Policy: no-referrer,
// qui ne couvre aucun de ces cinq chemins. On passe donc a Authorization: Bearer.
//
// ORDRE DE LECTURE :
//   a) en-tete Authorization: Bearer <jeton>   <- la voie normale desormais
//   b) ?token=                                  <- repli de transition, RETIRABLE
//   c) corps JSON { token }                     <- CONTRAT COURANT du front
//
// ============ (b) ET (c) N'ONT PAS DU TOUT LE MEME STATUT ============
// Ce module annoncait jusqu'au 10/09/2026 retirer « la lecture query/body » d'un
// seul bloc, au motif que des navigateurs executeraient encore l'ancien session.js.
// C'etait vrai pour la query, FAUX pour le corps. Retirer les deux ensemble aurait
// casse le front ACTUEL au deploiement, pas des navigateurs en retard. D'ou la
// scission en legacyQueryFrom() / legacyBodyFrom().
//
// (b) LA QUERY est retirable des maintenant. Plus aucun appel d'API du front ne
//     l'emploie (verifie par grep le 10/09/2026). Seuls les navigateurs au cache
//     fige sur l'ancien session.js s'en servent encore, et le service worker v9
//     les a fait tourner. Retirer : legacyQueryFrom() et son appel dans tokenFrom().
//
// (c) LE CORPS est ce que le front envoie AUJOURD'HUI sur ses POST. Il ne se
//     retire qu'APRES avoir migre chacun de ces fichiers vers authFetch/authHeaders
//     (public/js/session.js). LISTE DE TRAVAIL, verifiee par grep le 10/09/2026 —
//     14 fichiers, dont 6 manquaient a la liste de l'audit qualite du 10/09 :
//       public/js/site.js             <- 12 envois, de loin le plus gros
//       public/js/profile.js
//       public/js/push.js
//       public/js/quiet.js
//       public/js/forum.js
//       public/js/collection-page.js
//       public/js/deck-shared.js
//       public/js/deck-add.js
//       public/js/source.js
//       public/js/user-task-form.js
//       public/js/boutique.js
//       public/js/view-mode.js
//       public/js/session.js          <- oui, lui aussi, sur deux POST
//       public/js/favoris.js          <- orphelin (la route /favoris redirige),
//                                        mais encore servi en acces direct a
//                                        /favoris.html : a migrer ou a supprimer
//     AVANT de retirer (c), refaire le grep : cette liste date, le front bouge.
//       grep -nE "JSON.stringify\(.*\btoken\b|\btoken: " public/js/*.js
//
// LES LIENS D'EMAIL ne dependent ni de (b) ni de (c) et gardent leur jeton dans
// l'URL pour toujours — un client mail ne peut pas poser d'en-tete. Ils passent par
// des PARAMETRES DE CHEMIN (/confirm/:token, /unsubscribe/:token,
// /tache/:id/confirmer/:token). Le lien magique /connexion?token=<magic_token> est
// une query de PAGE, lue par le navigateur (public/js/myalerts.js) puis renvoyee en
// Bearer : il ne passe pas par (b) et ne sera pas touche par son retrait.
// =======================================================================

// Jeton = 64 hex (crypto.randomBytes(32)). On reste un peu plus permissif que ca pour
// ne pas dependre du format, mais on borne : un en-tete Authorization arbitraire ne doit
// pas se retrouver interpole tel quel dans une requete SQL parametree inutilement.
const BEARER_RE = /^Bearer[ \t]+([A-Za-z0-9._~+/=-]{1,512})[ \t]*$/i;

// (a) — le jeton porte par l'en-tete Authorization, ou null.
function bearerFrom(req) {
  const h = req && req.headers && req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const m = BEARER_RE.exec(h.trim());
  return m ? m[1] : null;
}

// (b) — la query. Repli de transition, RETIRABLE : voir l'en-tete.
function legacyQueryFrom(req) {
  const q = req && req.query && req.query.token;
  return typeof q === 'string' && q ? q : null;
}

// (c) — le corps JSON. CONTRAT COURANT du front : ne pas retirer avant d'avoir
// migre les 14 fichiers listes dans l'en-tete.
function legacyBodyFrom(req) {
  const b = req && req.body && typeof req.body === 'object' && req.body.token;
  return typeof b === 'string' && b ? b : null;
}

// Les deux replis, dans l'ordre historique (query puis corps). Garde la semantique
// exacte de l'ancienne fonction unique : rien ne change a l'execution.
function legacyFrom(req) {
  return legacyQueryFrom(req) || legacyBodyFrom(req);
}

// Le jeton de la requete, en-tete d'abord, repli ensuite.
function tokenFrom(req) {
  if (typeof req === 'string') return req; // appel historique authenticate('<jeton>')
  return bearerFrom(req) || legacyFrom(req);
}

// Middleware unique, monte une fois pour toute l'application. Il fait DEUX choses.
//
// 1) MIROIR. Le projet n'a aucun middleware d'authentification : chaque route appelle
//    authenticate() a la main, avec req.query.token ou req.body.token — 37 endroits.
//    Plutot que de reecrire ces 37 routes, on recopie le jeton de l'en-tete la ou elles
//    le cherchent deja. Une seule modification couvre tout, et le jour ou (b) sautera,
//    ces routes n'auront toujours pas a bouger : authenticate() lit l'en-tete lui-meme.
//
//    ATTENTION EXPRESS 5 : req.query y est un GETTER de prototype, recalcule a chaque
//    acces. `req.query.token = x` ne leve AUCUNE erreur et ne tient PAS — verifie sur
//    express 5.2.1 : la valeur posee est perdue au prochain acces. Le piege est vicieux
//    parce que le repli (b) masquerait la panne : tout continuerait de marcher via la
//    query string, et l'en-tete Bearer serait ignore en silence. D'ou defineProperty,
//    qui pose une propriete PROPRE et masque le getter.
//
// 2) CACHE. Toute requete porteuse d'un jeton recoit Cache-Control: private, no-store.
//    /api/my-alerts et /api/community-reports ne renvoyaient aucun en-tete de cache :
//    Cloudflare les laisse passer en DYNAMIC aujourd'hui, mais une Cache Rule sur /api/*
//    exposerait des donnees privees. On ne depend plus de la configuration du CDN.
function authTransport(req, res, next) {
  const bearer = bearerFrom(req);

  if (bearer) {
    // L'en-tete PRIME sur la query et sur le corps : c'est l'ordre (a) puis (b). Si les
    // deux sont presents, on ecrase — le repli ne doit jamais prendre le dessus sur la
    // voie normale, sinon l'ordre s'inverserait silencieusement le jour ou un client
    // enverrait les deux.
    const q = Object.assign({}, req.query, { token: bearer });
    Object.defineProperty(req, 'query', {
      value: q, writable: true, configurable: true, enumerable: true,
    });
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.token = bearer;
    }
  }

  if (bearer || legacyFrom(req)) res.set('Cache-Control', 'private, no-store');

  next();
}

module.exports = { authTransport, tokenFrom, bearerFrom };
