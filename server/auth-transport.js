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
//   b) ?token= / corps JSON                    <- REPLI TEMPORAIRE, voir ci-dessous
//
// ===================== LE REPLI (b) EST TEMPORAIRE =====================
// Il est la UNIQUEMENT pour la transition. Le service worker sert les assets en
// stale-while-revalidate : apres le deploiement, des navigateurs continuent d'executer
// l'ANCIEN session.js, qui envoie le jeton en query string. Couper (b) tout de suite
// deconnecterait ces gens sans rien leur expliquer.
// SON RETRAIT FERA L'OBJET D'UN LOT ULTERIEUR, quelques jours plus tard, quand le parc
// aura tourne. Retirer alors : la lecture query/body dans tokenFrom(), et le miroir
// pose par authTransport() ci-dessous.
// ATTENTION en le retirant : les liens d'EMAIL, eux, gardent leur jeton dans l'URL pour
// toujours — un client mail ne peut pas poser d'en-tete. Ils passent par des PARAMETRES
// DE CHEMIN (/confirm/:token, /unsubscribe/:token, /tache/:id/confirmer/:token) et par
// le lien magique qui arrive en /connexion?token=<magic_token>. Ce dernier est la SEULE
// query string a preserver le jour ou (b) sautera.
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

// (b) — le repli de transition : query puis corps JSON.
function legacyFrom(req) {
  if (!req) return null;
  const q = req.query && req.query.token;
  if (typeof q === 'string' && q) return q;
  const b = req.body && typeof req.body === 'object' && req.body.token;
  if (typeof b === 'string' && b) return b;
  return null;
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
