// Points cosmetiques (phase 1) : ecriture defensive dans points_ledger + solde.
// Statutaire uniquement (jamais convertible ni achetable avec de l'argent reel).
// Chaque award est un EFFET SECONDAIRE de l'action metier (adoption, abonnement,
// creation) : toute erreur est loggee et AVALEE, jamais propagee a l'appelant.
// L'append-only et l'anti double-comptage vivent dans server/db/init.sql
// (table points_ledger + index unique subscriber_id/event_type/ref_id).

const { pool } = require('./db');

// Valeurs validees : petit / moyen / grand score. Source de verite unique.
//  ALERT_SUBSCRIBED       5  — un abonnement neuf, une fois par (user, source) a vie
//  DECK_ADOPTED          10  — adopter un deck, une fois par (user, deck)
//  DECK_CREATED          25  — creer un deck (le fork prive n'en donne PAS)
//  DECK_ADOPTED_BY_OTHERS 50 — un tiers adopte MON deck, une fois par (deck, adoptant)
const POINTS = {
  ALERT_SUBSCRIBED: 5,
  DECK_ADOPTED: 10,
  DECK_CREATED: 25,
  DECK_ADOPTED_BY_OTHERS: 50,
};

// Insere une ligne de ledger et incremente le solde denormalise dans LA MEME
// requete (atomique via CTE en ecriture). Idempotent : si l'event est deja compte,
// l'index unique declenche un DO NOTHING silencieux -> aucun point ajoute, aucune
// erreur. Ne jette JAMAIS : l'action metier ne doit pas planter pour un point rate.
// ref_id : deck_id, source_id, ou 'deck_id:adopter_id' selon l'event (nullable).
async function award(subscriberId, eventType, refId) {
  const amount = POINTS[eventType];
  if (!subscriberId || amount == null) return; // garde-fou : event inconnu -> no-op
  try {
    await pool.query(
      `WITH ins AS (
         INSERT INTO points_ledger (subscriber_id, event_type, amount, ref_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (subscriber_id, event_type, ref_id) DO NOTHING
         RETURNING subscriber_id, amount
       )
       UPDATE subscribers s
          SET points_balance = points_balance + ins.amount
         FROM ins WHERE s.id = ins.subscriber_id`,
      [subscriberId, eventType, amount, refId == null ? null : String(refId)]
    );
  } catch (err) {
    // Effet secondaire non bloquant : on trace et on laisse l'action metier reussir.
    console.error(`[points] award ${eventType} echoue (sub ${subscriberId}, ref ${refId}) :`, err.message);
  }
}

// ===========================================================================
// Phase 2 : rang prive + badge Top 20. Classement calcule A LA VOLEE, jamais
// denormalise. Deux invariants partout : on ne compte QUE les participants
// (leaderboard_optout = false) qui ont un display_name non nul (jamais de pseudo
// vide expose). RANK() donne "1 + nb de soldes strictement superieurs", ce qui
// gere les ex aequo (rang partage, rang suivant saute) — un LIMIT 20 casserait
// sur egalites.
// ===========================================================================

// Cache en memoire process (2 min) du Set des subscriber_id de rang <= 20, sur le
// modele de routes/le-point.js. Evite un COUNT par deck au rendu de la grille : une
// seule requete pour toute la page, membership teste en JS via set.has(owner_id).
let top20Cache = { at: 0, ids: null };
const TOP20_CACHE_MS = 2 * 60 * 1000;

async function getTop20Ids() {
  const now = Date.now();
  if (top20Cache.ids && now - top20Cache.at <= TOP20_CACHE_MS) return top20Cache.ids;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM (
         SELECT id, RANK() OVER (ORDER BY points_balance DESC) AS rk
           FROM subscribers
          WHERE leaderboard_optout = false AND display_name IS NOT NULL
       ) t WHERE rk <= 20`
    );
    top20Cache = { at: now, ids: new Set(rows.map((r) => r.id)) };
  } catch (err) {
    // Badge = cosmetique non critique : en cas d'echec on renvoie un Set vide
    // (aucun badge) sans planter le rendu de la grille/du detail.
    console.error('[points] getTop20Ids echoue :', err.message);
    if (!top20Cache.ids) top20Cache = { at: now, ids: new Set() };
  }
  return top20Cache.ids;
}

// Rang prive d'un compte pour "Mon compte". NULL si le compte est opt-out ou sans
// pseudo (aucun rang calcule/affiche, on ne montre que le solde). Non cache : une
// requete par chargement de compte, negligeable et toujours fraiche.
async function getRank(subscriberId) {
  if (!subscriberId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT CASE
                WHEN me.leaderboard_optout = false AND me.display_name IS NOT NULL
                THEN 1 + (SELECT COUNT(*) FROM subscribers o
                           WHERE o.leaderboard_optout = false AND o.display_name IS NOT NULL
                             AND o.points_balance > me.points_balance)
                ELSE NULL
              END AS rank
         FROM subscribers me WHERE me.id = $1`,
      [subscriberId]
    );
    return rows[0] ? rows[0].rank : null; // rank est INTEGER ou NULL
  } catch (err) {
    console.error('[points] getRank echoue :', err.message);
    return null;
  }
}

module.exports = { award, POINTS, getTop20Ids, getRank };
