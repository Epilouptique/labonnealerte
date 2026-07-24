// Source PARAMÉTRÉE (OpenAlert v2) : « le Tour de France passe près de chez vous ».
// La config annuelle transcrit le parcours OFFICIEL (letour.fr) en liste
// (département, date(s) de passage). ZÉRO API. Fenêtre : J-2 → jour de passage.
//
// PROCESSUS ANNUEL (obligatoire, type Bison Futé) : recharger le parcours à CHAQUE
// annonce officielle — octobre N-1 pour l'édition N — par TRANSCRIPTION depuis
// letour.fr / ASO d'une source CONSULTÉE. JAMAIS de parcours reconstruit de mémoire.
// En l'absence de source officielle consultable, ne rien remplir (config vide assumée).
//
// ÉTAT AU 25/07/2026 (revérifié) : le Tour 2026 (Grand Départ Barcelone 4 juil., arrivée
// Paris 26 juil. ; Gap = départ de l'étape 19 le 24 juil., PAS le Grand Départ) s'achève
// dans deux jours. Les données de passage PAR DÉPARTEMENT restent NON publiées de façon
// exploitable (letour.fr donne villes départ/arrivée + régions, pas la liste des dépts
// traversés par étape ; letour.fr n'est en outre pas récupérable depuis l'outillage de ce
// poste). Seuls seraient sûrs les dépts des VILLES étapes — valeur nulle à J-2 de la fin.
// Donc CONFIG TOUJOURS VIDE (aucune date inventée). Édition 2026 non rechargée : sans objet.
// ⚠️ TODO octobre 2026 : à l'annonce du parcours 2027, transcrire (département → dates)
//    depuis letour.fr. Voir « TODO calendaires datés » dans .claude/etat-projet.md.
const { DEPARTEMENTS } = require('../geo');
const { PREF } = require('./lib/prefectures');

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_URL = 'https://www.letour.fr/fr/parcours';
const ANNOUNCE_DAYS = 2;

// { departement: '05', dates: [new Date(2027, 6, 18)], etape: 'Gap → Briançon' }.
// VIDE tant que le parcours par département n'est pas transcrit (source inactive).
const PARCOURS = [];

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.filter((d) => PREF[d.code]).map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
];

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  const byDept = {};
  PARCOURS.forEach((p) => { byDept[p.departement] = p; });

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const p = byDept[dep];
    if (!p || !Array.isArray(p.dates)) return inactive(params);
    for (const d of p.dates) {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const activeEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
      const windowStart = new Date(day.getTime() - ANNOUNCE_DAYS * DAY_MS);
      if (now.getTime() >= windowStart.getTime() && now.getTime() <= activeEnd.getTime()) {
        const quand = now < day ? `${JOURS[day.getDay()]} ${day.getDate()} ${MOIS[day.getMonth()]}` : "aujourd'hui";
        const etape = p.etape ? ` (étape ${p.etape})` : '';
        return {
          params,
          state: 'active',
          since: windowStart,
          until: activeEnd,
          message: `🚴 Le Tour de France traverse ${NAME[dep] || dep} ${quand}${etape}.`,
          url: PUBLIC_URL,
        };
      }
    }
    return inactive(params);
  });
}

module.exports = { id: 'tour-de-france-passage', paramsSchema, checkWithParams };
