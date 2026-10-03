// scripts/test-profil-geo-stable.js
// ─────────────────────────────────────────────────────────────────────────────
// TEST DE NON-RÉGRESSION — « Pays / Région / Département / Ville ne bougent plus
// tout seuls » (fil #9bis, section G4). LECTURE SEULE côté script.
//
// Le script n'exécute AUCUN SQL : il appelle 5 fois de suite GET /api/my-alerts
// avec un jeton de session et compare les 4 valeurs géo d'un appel à l'autre.
// C'est exactement le geste qui déclenchait le bug : chaque chargement du
// dashboard relançait un lookup IPLocate et remplissait un champ de plus, depuis
// une IP potentiellement différente.
//
// NOTE : le serveur, lui, peut écrire UNE fois lors du premier appel (marquage
// 'auto'/'auto-none' de la tentative d'auto-remplissage). C'est précisément ce
// qui doit rendre les appels suivants stables. Aucune alerte n'est activée.
//
// Usage :
//   node scripts/test-profil-geo-stable.js --token=<jeton> [--url=https://labonnealerte.fr] [--n=5]
//   (le jeton se lit dans localStorage['lba-token'] sur le site, une fois connecté)
//
// Sortie : un tableau des 5 lectures + VERDICT STABLE / INSTABLE (exit 1 si instable).
// ─────────────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));

const TOKEN = args.token;
const BASE = (args.url || 'https://labonnealerte.fr').replace(/\/$/, '');
const N = Math.max(2, parseInt(args.n, 10) || 5);

if (!TOKEN || TOKEN === true) {
  console.error('Jeton manquant. Usage : node scripts/test-profil-geo-stable.js --token=<jeton> [--url=...] [--n=5]');
  process.exit(2);
}

const CHAMPS = ['country', 'region', 'departement', 'ville'];

async function lire() {
  const res = await fetch(`${BASE}/api/my-alerts?token=${encodeURIComponent(TOKEN)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET /api/my-alerts → HTTP ${res.status}`);
  const data = await res.json();
  const p = data.profile || data.prefs || data;
  const out = {};
  CHAMPS.forEach((c) => { out[c] = p[c] === undefined ? null : p[c]; });
  return out;
}

(async () => {
  console.log(`── Stabilité du profil géo : ${N} lectures de ${BASE}/api/my-alerts ──\n`);
  const lectures = [];
  for (let i = 1; i <= N; i++) {
    const v = await lire();
    lectures.push(v);
    console.log(`#${i}  pays=${v.country ?? '—'}  région=${v.region ?? '—'}  dept=${v.departement ?? '—'}  ville=${v.ville ?? '—'}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  const ref = lectures[0];
  const derives = [];
  lectures.slice(1).forEach((v, i) => {
    CHAMPS.forEach((c) => {
      if (v[c] !== ref[c]) derives.push(`lecture #${i + 2} : ${c} « ${ref[c] ?? '—'} » → « ${v[c] ?? '—'} »`);
    });
  });

  // Cohérence région/département : un département n'appartient qu'à une région.
  let incoherence = null;
  try {
    const { regionFromDept } = require('../server/geo');
    if (ref.departement) {
      const attendue = regionFromDept(ref.departement);
      if (attendue && ref.region && attendue !== ref.region) {
        incoherence = `département ${ref.departement} → région attendue « ${attendue} », stockée « ${ref.region} »`;
      }
    }
  } catch (e) { /* geo.js non chargeable hors repo : contrôle optionnel */ }

  console.log('');
  if (derives.length) {
    console.log('VERDICT : INSTABLE — les valeurs ont changé sans action utilisateur :');
    derives.forEach((d) => console.log('  · ' + d));
    process.exit(1);
  }
  console.log(`VERDICT : STABLE — ${N} lectures identiques, aucune dérive.`);
  if (incoherence) {
    console.log(`\nATTENTION (donnée stockée, pas une régression de code) : ${incoherence}`);
    console.log('→ valeur à corriger en base par un script dédié avec --check, jamais par un UPDATE direct.');
  }
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(2); });
