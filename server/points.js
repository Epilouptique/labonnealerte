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

module.exports = { award, POINTS };
