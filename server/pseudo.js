// pseudo.js — génération du @pseudo public STABLE d'un membre à partir de son
// display_name, via server/forum-slug.js (même règle de slug, aucune duplication).
// Généré UNE fois (à la 1re pose du display_name + backfill), JAMAIS régénéré au
// renommage → les liens /u/:pseudo restent durables. Repli u<id> si le nom ne
// produit pas de slug (nom tout-emoji). NULL tant qu'il n'y a pas de display_name.

const { slugify, slugBase, SLUG_MAX } = require('./forum-slug');

// Pose le pseudo d'un membre s'il n'en a pas encore (idempotent : NE touche jamais un
// pseudo déjà posé, WHERE pseudo IS NULL). Retry sur collision de uq_subscribers_pseudo
// (suffixe incrémenté, borné), repli final u<id> (unique par construction).
// Renvoie le pseudo effectif (existant ou nouvellement posé), ou null si aucun
// display_name exploitable. Best-effort : ne jette pas (le pseudo est secondaire).
async function ensurePseudo(pool, id, displayName) {
  if (!displayName) return null;
  const fallback = 'u' + String(id);
  const base = (slugify(displayName, fallback) || fallback).slice(0, SLUG_MAX);

  for (let n = 1; n <= 20; n++) {
    const cand = n === 1 ? base : (base.slice(0, SLUG_MAX - String(n).length) + n);
    try {
      const r = await pool.query(
        'UPDATE subscribers SET pseudo = $1 WHERE id = $2 AND pseudo IS NULL RETURNING pseudo',
        [cand, id]
      );
      if (r.rows.length) return r.rows[0].pseudo;   // posé
      // 0 ligne → pseudo déjà non NULL : on relit et on renvoie l'existant (stabilité).
      const cur = await pool.query('SELECT pseudo FROM subscribers WHERE id = $1', [id]);
      return (cur.rows[0] && cur.rows[0].pseudo) || null;
    } catch (e) {
      if (e && e.code === '23505') continue;         // collision → suffixe suivant
      console.error('[pseudo] ensurePseudo :', e.message);
      return null;                                   // best-effort : ne bloque pas l'appelant
    }
  }
  // Dernier recours : u<id> brut (unique). Peut échouer si déjà pris par un autre → null.
  try {
    const r = await pool.query(
      'UPDATE subscribers SET pseudo = $1 WHERE id = $2 AND pseudo IS NULL RETURNING pseudo',
      [fallback.slice(0, SLUG_MAX), id]
    );
    return (r.rows[0] && r.rows[0].pseudo) || null;
  } catch (e) { console.error('[pseudo] ensurePseudo fallback :', e.message); return null; }
}

module.exports = { ensurePseudo };
