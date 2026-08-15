// Cartes COMMUNAUTAIRES — CONFIGURATION PAR TYPE (source de vérité unique).
//
// POURQUOI CE FICHIER : community_reports porte une colonne `type` filtrante depuis
// l'origine (index (type, status)), et les 4 routes de community-reports.js sont
// structurellement type-agnostiques — seule une constante `TYPE = 'chat-perdu'` les
// figeait sur un type unique. Ajouter un 2e type (chien-perdu) ne demande donc PAS
// un 2e routeur : uniquement de savoir ce qui VARIE d'un type à l'autre. C'est ici.
//
// Ajouter un type = 1 entrée ici + 1 ligne catalogue dans init.sql (cf. `catalog`
// ci-dessous). Aucun autre fichier à toucher.
//
// SÉCURITÉ : `type` arrive du client (corps du POST, query du GET). getType() est une
// LISTE BLANCHE stricte — un type inconnu renvoie null et la route répond 400. Une
// valeur cliente n'est JAMAIS insérée telle quelle en base : c'est toujours cfg.id,
// relu d'ici, qui part dans la requête.

const TYPES = {
  'chat-perdu': {
    id: 'chat-perdu',
    // label : mot injecté dans les libellés d'accessibilité et les emails
    // (« le chat de votre signalement »). Toujours au singulier, sans article.
    label: 'chat',
    emoji: '🐱',
    emailHeading: 'Une piste pour votre chat',
    // Dédup par commune : une seule instance active par commune, les suivants
    // REJOIGNENT au lieu de créer. Choix propre à la famille « animal perdu »
    // (le même animal serait signalé N fois) — pas une règle transversale.
    dedupByCommune: true,
    expireDays: 7,
    maxExtensions: 3,
    spotsToClose: 3,
    defaultRadiusKm: 15,
    minRadiusKm: 10,
    maxRadiusKm: 50,
    radiusChoices: [10, 15, 20, 30, 50],
    // GABARIT de la ligne catalogue. init.sql reste la SOURCE DE VÉRITÉ de ce qui
    // est réellement en base (ces valeurs ne sont lues par aucun code) : elles sont
    // ici pour que l'ajout d'un type se lise d'un seul tenant. En cas d'écart,
    // c'est init.sql qui a raison.
    catalog: {
      name: 'Chat perdu',
      subtitle: 'Signalement communautaire par commune',
      description: 'Alerte si un chat disparaît près de chez vous. Vous en croisez un ? Signalez-le. C\'est le vôtre ? Prévenez le quartier.',
      hint: 'La commune où le chat a été vu.',
      forumSlug: 'chatperdu',
    },
  },

  'chien-perdu': {
    id: 'chien-perdu',
    label: 'chien',
    emoji: '🐶',
    emailHeading: 'Une piste pour votre chien',
    dedupByCommune: true,
    expireDays: 7,
    maxExtensions: 3,
    spotsToClose: 3,
    defaultRadiusKm: 15,
    minRadiusKm: 10,
    maxRadiusKm: 50,
    radiusChoices: [10, 15, 20, 30, 50],
    catalog: {
      name: 'Chien perdu',
      subtitle: 'Signalement communautaire par commune',
      description: 'Alerte si un chien disparaît près de chez vous. Vous en croisez un ? Signalez-le. C\'est le vôtre ? Prévenez le quartier.',
      hint: 'La commune où le chien a été vu.',
      forumSlug: 'chienperdu',
    },
  },
};

// Type par défaut : un client ANTÉRIEUR à ce refactor n'envoie aucun `type` (le POST
// n'en portait pas). Sans ce repli, un onglet resté ouvert pendant le déploiement
// verrait ses signalements refusés en 400. Vaut donc chat-perdu, le seul type qui
// existait avant — jamais chien-perdu.
const DEFAULT_TYPE = 'chat-perdu';

/**
 * Liste blanche stricte. Retourne la config du type, ou null si inconnu.
 * @param {*} raw valeur brute venant du client (jamais utilisée telle quelle ensuite)
 * @returns {?object}
 */
function getType(raw) {
  if (raw == null || raw === '') return TYPES[DEFAULT_TYPE];
  if (typeof raw !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(TYPES, raw) ? TYPES[raw] : null;
}

/** Ids connus (pour /api/sources et les tests). */
function typeIds() { return Object.keys(TYPES); }

/**
 * Sous-ensemble transmis AU NAVIGATEUR (cf. GET /api/sources). Volontairement
 * restreint à ce que le front rend : libellés d'accessibilité et choix de rayon.
 * Les règles métier (dédup, expiration, seuil de clôture) restent serveur.
 */
function publicConfig(id) {
  const cfg = TYPES[id];
  if (!cfg) return null;
  return {
    type: cfg.id,
    label: cfg.label,
    radiusChoices: cfg.radiusChoices,
    defaultRadiusKm: cfg.defaultRadiusKm,
  };
}

/**
 * Enrichit une ligne `sources` avec sa config publique si c'est une carte
 * communautaire (champ `community`), sinon la renvoie telle quelle. À appliquer
 * à TOUTE route qui sert des lignes `sources` au rendu de carte (/api/sources,
 * /api/favorites, packs) : sans elle, cards.js retombe sur son repli et une carte
 * chien-perdu parlerait de chat dans ses libellés d'accessibilité.
 * Aucune requête : lecture de ce module.
 */
function attachConfig(row) {
  if (!row || row.type !== 'community') return row;
  const cfg = publicConfig(row.id);
  return cfg ? Object.assign({}, row, { community: cfg }) : row;
}

module.exports = { TYPES, DEFAULT_TYPE, getType, typeIds, publicConfig, attachConfig };
