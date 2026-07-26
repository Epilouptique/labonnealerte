// scripts/apply-long-descriptions.js — JETABLE.
// Met a jour description_long pour 9 sources (versions reecrites <=300, sans perte vs le
// texte integral) qui avaient ete tronquees brutalement a 300 par le backfill de migration.
// Ne touche QUE description_long (surtout PAS description, deja bonne). Verifs avant toute
// ecriture ; UNE SEULE transaction (BEGIN/COMMIT, ROLLBACK sur erreur) ; UPDATE parametre.
//   node scripts/apply-long-descriptions.js           (.env pointe la PROD : applique)
//   node scripts/apply-long-descriptions.js --check    (verifs seules, lecture seule)

require('dotenv').config();
const { pool } = require('../server/db');

const MAX = 300;

// 9 couples id -> nouvelle description_long (<=300), codes en dur (revue simple).
const ROWS = [
  ['risque-secheresse',
   'Choisissez un ou plusieurs départements et soyez alerté dès qu\'un arrêté préfectoral de restriction d\'eau (alerte, alerte renforcée ou crise) est pris. Vue d\'ensemble départementale (ex-Propluvia). Pour les restrictions précises de votre commune, voir « Restrictions d\'eau » (VigiEau).'],
  ['catnat-commune',
   'Soyez alerté à la publication d\'un NOUVEL arrêté de catastrophe naturelle (inondation, sécheresse, mouvement de terrain…) reconnu pour votre commune. Un arrêté CatNat ouvre un délai pour déclarer les dommages à l\'assurance. Données officielles Géorisques (BRGM). Seul un nouvel arrêté compte.'],
  ['rappel-conso',
   'Alerte quand un produit est rappelé pour un RISQUE GRAVE, dans la ou les catégories de votre choix (alimentation, maison, électrique, jouets, mode…). Filtre « risques graves uniquement » (microbien, toxique, blessure, brûlure, chimique…) pour éviter le bruit. Source officielle RappelConso (DGCCRF).'],
  ['veille-page',
   'Entrez l\'adresse d\'une page web : vous êtes prévenu dès que son contenu change. Détection par comparaison du texte visible (on signale qu\'un changement a eu lieu, pas ce qui a changé). Fonctionne mieux sur des pages classiques ; pas les sites 100% JavaScript ni les flux d\'actualité continus.'],
  ['eau-potable-commune',
   'Soyez alerté si un contrôle sanitaire déclare l\'eau du robinet de votre commune NON CONFORME aux limites de qualité (bactériologique ou physico-chimique). Données officielles Hub\'Eau / ARS, jusqu\'au plus petit village. Seul un nouveau contrôle non conforme après l\'abonnement déclenche l\'alerte.'],
  ['grands-anniversaires',
   'La veille et le jour J des grands anniversaires à chiffre rond (30, 50, 100, 150 ans) de la culture et de la science, curés à la main pour 2026-2028, plus les anniversaires de 1re parution en France de mangas cultes. Mémoire culturelle et scientifique, jamais un calendrier des tragédies.'],
  ['crypto-seuil',
   'Choisissez une cryptomonnaie et un seuil de prix en euros : vous êtes alerté quand le prix franchit ce seuil (hausse ou baisse). Prix issus de Binance (repli Coinbase). Un seuil que vous choisissez, ce n\'est PAS un conseil financier. Distinct de « Mouvement du Bitcoin » (variation en %).'],
  ['hausse-tarif-operateur',
   'Surveillez la grille tarifaire d\'un opérateur télécom (Bouygues, Free, SFR/RED, Orange — box et mobile). Prévenu qu\'un changement a été détecté dans le document officiel, sans montant ni pourcentage (à vérifier vous-même sur le lien). Vérification hebdomadaire par comparaison de signature.'],
  ['arts-visuels-evenements',
   'Un rappel à l\'approche des grands rendez-vous des arts visuels (dates officielles vérifiées) : Art Basel Paris, Prix Marcel Duchamp, Biennale de Venise, Salon du Dessin, Drawing Now, Carnet de Voyage, Salon jeunesse de Montreuil. D\'autres seront ajoutés dès publication de leurs dates.'],
];

(async () => {
  let client;
  try {
    // Verif 1 : longueur <= 300 (en points de code, comme char_length de Postgres).
    const tooLong = ROWS.filter(([, t]) => Array.from(t).length > MAX)
      .map(([id, t]) => id + ' (' + Array.from(t).length + ')');
    if (tooLong.length) throw new Error('description_long > ' + MAX + ' :\n  ' + tooLong.join('\n  '));
    const empty = ROWS.filter(([, t]) => !t || !t.trim()).map(([id]) => id);
    if (empty.length) throw new Error('description_long vide : ' + empty.join(', '));

    // Verif 2 : les 9 ids existent en base.
    const ids = ROWS.map(([id]) => id);
    const { rows } = await pool.query('SELECT id FROM sources WHERE id = ANY($1)', [ids]);
    const known = new Set(rows.map((r) => r.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) throw new Error('ids INCONNUS dans sources : ' + unknown.join(', '));
    console.log('Verifs OK : ' + ROWS.length + ' description_long, toutes <= ' + MAX + ', tous les ids existent.');

    if (process.argv.includes('--check')) { console.log('--check : verifs seules, aucune ecriture.'); return; }

    // Ecriture : une seule transaction. Ne touche QUE description_long.
    client = await pool.connect();
    await client.query('BEGIN');
    let n = 0;
    for (const [id, t] of ROWS) {
      const r = await client.query('UPDATE sources SET description_long = $1 WHERE id = $2', [t, id]);
      n += r.rowCount;
    }
    await client.query('COMMIT');
    console.log('COMMIT OK : ' + n + ' ligne(s) mise(s) a jour (9 attendu). ids non trouves : ' + unknown.length + '.');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectue (aucune ecriture conservee).'); } catch (_) {} }
    console.error('ECHEC :', e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
