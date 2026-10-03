// scripts/repair-descriptions-jargon.js
// ─────────────────────────────────────────────────────────────────────────────
// RÉPARATION DE DONNÉES — jargon technique visible dans sources.description_long
// (verso des cartes). Fil #9bis, audit 2, section G2.
//
// MODE PAR DÉFAUT : --check (SIMULATION, aucune écriture). L'écriture réelle exige
// --apply EXPLICITEMENT. Chaque remplacement est borné par un WHERE vérifié
// (id = $1 AND description_long = $2, texte AVANT intégral) : si la description a
// changé depuis l'écriture de ce script, la ligne n'est PAS touchée et le script le
// signale. Transaction unique : tout passe, ou rien.
//
// Aucune phrase factuelle n'est inventée : on retire ou on reformule uniquement des
// mentions d'implémentation (API, anti-SSRF, heuristique, clé serveur, enum…).
//
// Usage :
//   node scripts/repair-descriptions-jargon.js              → simulation (défaut)
//   node scripts/repair-descriptions-jargon.js --check      → idem, explicite
//   node scripts/repair-descriptions-jargon.js --apply      → écrit en base
//
// Contrôle manuel équivalent (lecture seule) :
//   SELECT id, description_long FROM sources
//    WHERE id IN ('veille-rss','veille-stock','veille-hackernews','github-release',
//                 'domaine-disponibilite','domaine-securite','vigilance-submersion','ipc-quebec');
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// avant : texte INTÉGRAL attendu en base (sert de garde-fou dans le WHERE)
// apres : texte proposé
const CORRECTIFS = [
  {
    id: 'veille-rss',
    avant: "Suivez n'importe quel flux RSS ou Atom : alerté à chaque nouvel article de moins de 72h. Pour les flux qui publient peu — un flux quotidien vous notifiera chaque jour. URL https uniquement (protections anti-SSRF).",
    apres: "Suivez n'importe quel flux RSS ou Atom : alerté à chaque nouvel article de moins de 72h. Pour les flux qui publient peu — un flux quotidien vous notifiera chaque jour. Adresses en https uniquement.",
  },
  {
    id: 'veille-stock',
    avant: "Entrez l'adresse d'une page produit : vous êtes prévenu quand sa disponibilité change (retour en stock ou rupture). Heuristique par mots-clés, best-effort : fiable sur les boutiques classiques, pas sur les sites 100% JavaScript. Protections anti-SSRF, https.",
    apres: "Entrez l'adresse d'une page produit : vous êtes prévenu quand sa disponibilité change (retour en stock ou rupture). Fonctionne sur la plupart des boutiques ; les pages entièrement dynamiques ne sont pas toujours lisibles. Adresses en https uniquement.",
  },
  {
    id: 'veille-hackernews',
    avant: "Alerte quand une story contenant votre mot-clé dépasse 100 points sur Hacker News en moins de 24h (signal fort). API Algolia publique.",
    apres: "Alerte quand une story contenant votre mot-clé dépasse 100 points sur Hacker News en moins de 24h (signal fort).",
  },
  {
    id: 'github-release',
    avant: "Prévenu à la sortie d'une nouvelle version stable d'un dépôt GitHub que vous suivez (owner/repo). Idéal pour vos outils et dépendances favoris. API publique GitHub.",
    apres: "Prévenu à la sortie d'une nouvelle version stable d'un dépôt GitHub que vous suivez (owner/repo). Idéal pour vos outils et dépendances favoris.",
  },
  {
    id: 'domaine-disponibilite',
    avant: "Surveillez la disponibilité d'un domaine : alerte si le site répond en erreur (4xx/5xx), en timeout, ou ne répond plus. L'alerte est confirmée sur deux vérifications (pas de fausse alerte sur un incident passager). https, protections anti-SSRF.",
    apres: "Surveillez la disponibilité d'un domaine : alerte si le site répond en erreur, met trop de temps à répondre, ou ne répond plus. L'alerte est confirmée sur deux vérifications (pas de fausse alerte sur un incident passager). Adresses en https uniquement.",
  },
  {
    id: 'domaine-securite',
    avant: "Vérifiez si un domaine est signalé dans la base publique de malware/phishing URLhaus (abuse.ch). Alerte immédiate en cas de signalement, avec le type de menace. Nécessite une clé API URLhaus (côté serveur).",
    apres: "Vérifiez si un domaine est signalé dans la base publique de logiciels malveillants et d'hameçonnage URLhaus (abuse.ch). Alerte immédiate en cas de signalement, avec le type de menace.",
  },
  {
    id: 'vigilance-submersion',
    avant: "Vigilance vagues-submersion (submersion marine, tempête littorale) de Météo-France pour la région côtière de votre choix : alerte en vigilance orange ou rouge. Enum limité aux 8 régions littorales. Nécessite une clé Météo-France (côté serveur) ; sans clé, la carte reste silencieuse.",
    apres: "Vigilance vagues-submersion (submersion marine, tempête littorale) de Météo-France pour la région côtière de votre choix : alerte en vigilance orange ou rouge. Disponible pour les 8 régions littorales.",
  },
  {
    id: 'ipc-quebec',
    avant: "Signalement de la publication mensuelle de l'Indice des prix à la consommation pour le Québec (angle inflation). PRÊTE À BRANCHER : nécessite le raccordement du flux ISQ / API Statistique Canada (voir rapport).",
    apres: "Signalement de la publication mensuelle de l'Indice des prix à la consommation pour le Québec (angle inflation). Cette alerte n'est pas encore active.",
  },
];

function banniere() {
  const l = '─'.repeat(72);
  console.log(l);
  if (APPLY) {
    console.log("MODE : --apply  →  ÉCRITURE RÉELLE en base (sources.description_long)");
  } else {
    console.log('MODE : --check  →  SIMULATION, aucune écriture (ajoutez --apply pour écrire)');
  }
  console.log(`Cible : ${CORRECTIFS.length} description(s) de sources`);
  console.log(l + '\n');
}

(async () => {
  banniere();
  const client = await pool.connect();
  let aEcrire = 0; const ignorees = [];
  try {
    await client.query('BEGIN');
    for (const c of CORRECTIFS) {
      const { rows } = await client.query('SELECT description_long FROM sources WHERE id = $1', [c.id]);
      if (!rows.length) { ignorees.push(`${c.id} : source absente`); continue; }
      const actuel = rows[0].description_long;
      if (actuel === c.apres) { console.log(`  = ${c.id} : déjà corrigée`); continue; }
      if (actuel !== c.avant) {
        ignorees.push(`${c.id} : le texte en base diffère du texte attendu → NON MODIFIÉE`);
        continue;
      }
      console.log(`  ~ ${c.id}`);
      console.log(`      avant : ${c.avant.slice(-96)}`);
      console.log(`      après : ${c.apres.slice(-96)}`);
      if (APPLY) {
        // WHERE vérifié : l'ancien texte INTÉGRAL fait partie de la condition.
        const r = await client.query(
          'UPDATE sources SET description_long = $3 WHERE id = $1 AND description_long = $2',
          [c.id, c.avant, c.apres]
        );
        if (r.rowCount !== 1) throw new Error(`${c.id} : ${r.rowCount} ligne(s) touchée(s), attendu 1`);
      }
      aEcrire++;
    }

    if (APPLY) {
      await client.query('COMMIT');
      // AUTO-VÉRIFICATION après écriture : on relit et on compare au texte attendu.
      let ok = 0;
      for (const c of CORRECTIFS) {
        const { rows } = await client.query('SELECT description_long FROM sources WHERE id = $1', [c.id]);
        if (rows.length && rows[0].description_long === c.apres) ok++;
      }
      console.log(`\nAUTO-VÉRIFICATION : ${ok}/${CORRECTIFS.length} description(s) conformes au texte attendu.`);
      if (ok !== CORRECTIFS.length) { console.log('→ écart détecté, vérifiez les lignes ignorées ci-dessous.'); }
    } else {
      await client.query('ROLLBACK');
      console.log(`\nSIMULATION : ${aEcrire} ligne(s) seraient modifiée(s). Aucune écriture effectuée.`);
    }

    if (ignorees.length) {
      console.log('\nLignes ignorées :');
      ignorees.forEach((i) => console.log('  · ' + i));
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nÉCHEC (transaction annulée) :', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
