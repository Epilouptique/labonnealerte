// Source PARAMÉTRÉE (OpenAlert v2) : soldes en OUTRE-MER. Territoire au choix de
// l'abonné. ZÉRO API. Même patron de calcul que soldes.js (métropole), mais avec
// les règles dérogatoires par territoire de l'arrêté du 27 mai 2019
// (JORFTEXT000038523234, annexe lue en texte brut sur Légifrance le 19/07/2026).
// Durée légale : 4 semaines partout (fin = début + 28 jours).
//
// Règles par territoire (métropole = hiver : 2e mercredi de janvier ; été :
// dernier mercredi de juin) :
//   • Guadeloupe : hiver = 1er samedi de janvier ; été = dernier samedi de septembre
//   • Martinique : hiver = ALIGNÉ métropole ; été = 1er jeudi d'octobre
//   • Guyane     : ALIGNÉ métropole (hiver ET été)
//   • La Réunion : hiver LÉGAL = 1er samedi de septembre ; été LÉGAL = 1er samedi
//     de février (saisons australes — NE PAS inverser à l'affichage : on emploie
//     les termes légaux du texte, pas les saisons calendaires métropolitaines)
//   • Mayotte    : ALIGNÉ métropole (hiver ET été)
//   • Saint-Pierre-et-Miquelon : hiver = 1er mercredi APRÈS le 15 janvier ;
//     été = 1er mercredi APRÈS le 14 juillet
//   • Saint-Barthélemy / Saint-Martin : hiver = 1er samedi de mai ;
//     été = 2e samedi d'octobre
// Les 8 territoires ont été confirmés sur le texte brut → tous actifs.

const { nthWeekday, lastWeekday, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const DUREE_MS = 28 * DAY_MS;
const ANNOUNCE_DAYS = 5;
const PUBLIC_URL = 'https://www.economie.gouv.fr/particuliers/dates-soldes';

// Règles métropole réutilisées pour les territoires alignés.
function metroHiver(y) { return nthWeekday(y, 0, 3, 2); }   // 2e mercredi de janvier
function metroEte(y) { return lastWeekday(y, 5, 3); }       // dernier mercredi de juin

// 1er mercredi (weekday 3) strictement APRÈS le `jour` du mois `monthIdx` (0-based).
function mercrediApres(year, monthIdx, jour) {
  let d = new Date(year, monthIdx, jour + 1);
  while (d.getDay() !== 3) d = new Date(year, monthIdx, d.getDate() + 1);
  return d;
}

// austral : marque les termes de saison propres à La Réunion (clarté d'affichage).
const TERRITOIRES = [
  { value: 'guadeloupe', label: 'Guadeloupe',
    hiver: (y) => nthWeekday(y, 0, 6, 1), ete: (y) => lastWeekday(y, 8, 6) },
  { value: 'martinique', label: 'Martinique',
    hiver: metroHiver, ete: (y) => nthWeekday(y, 9, 4, 1) },
  { value: 'guyane', label: 'Guyane', hiver: metroHiver, ete: metroEte },
  { value: 'reunion', label: 'La Réunion', austral: true,
    hiver: (y) => nthWeekday(y, 8, 6, 1), ete: (y) => nthWeekday(y, 1, 6, 1) },
  { value: 'mayotte', label: 'Mayotte', hiver: metroHiver, ete: metroEte },
  { value: 'saint-pierre-et-miquelon', label: 'Saint-Pierre-et-Miquelon',
    hiver: (y) => mercrediApres(y, 0, 15), ete: (y) => mercrediApres(y, 6, 14) },
  { value: 'saint-barthelemy', label: 'Saint-Barthélemy',
    hiver: (y) => nthWeekday(y, 4, 6, 1), ete: (y) => nthWeekday(y, 9, 6, 2) },
  { value: 'saint-martin', label: 'Saint-Martin',
    hiver: (y) => nthWeekday(y, 4, 6, 1), ete: (y) => nthWeekday(y, 9, 6, 2) },
];
const BY_VALUE = {};
TERRITOIRES.forEach((t) => { BY_VALUE[t.value] = t; });

const paramsSchema = [{
  key: 'territoire',
  label: 'Territoire',
  type: 'enum',
  values: TERRITOIRES.map((t) => ({ value: t.value, label: t.label })),
  multiple: true,
  required: true,
  default: null,
}];

function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Événements (hiver/été) du territoire pour l'année en cours ±1.
function eventsFor(t, y) {
  const out = [];
  for (const year of [y - 1, y, y + 1]) {
    const hiver = t.hiver(year);
    const ete = t.ete(year);
    out.push({ saison: 'hiver', start: hiver, end: new Date(hiver.getTime() + DUREE_MS) });
    out.push({ saison: 'été', start: ete, end: new Date(ete.getTime() + DUREE_MS) });
  }
  return out.sort((a, b) => a.start - b.start);
}

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  const y = now.getFullYear();

  return combos.map((params) => {
    const t = BY_VALUE[String((params && params.territoire) || '')];
    if (!t) return inactive(params);
    for (const ev of eventsFor(t, y)) {
      const windowStart = new Date(ev.start.getTime() - ANNOUNCE_DAYS * DAY_MS);
      if (now >= windowStart && now <= ev.end) {
        // Terme légal exact (jamais inversé) ; « austral » pour lever l'ambiguïté à La Réunion.
        const saison = ev.saison + (t.austral ? ' austral' : '');
        const during = now >= ev.start;
        const message = during
          ? `🛍️ ${t.label} : soldes d'${saison} en cours, fin le ${formatJourMois(ev.end)}.`
          : `🛍️ ${t.label} : soldes d'${saison} du ${formatJourMois(ev.start)} au ${formatJourMois(ev.end)} (4 semaines).`;
        return { params, state: 'active', since: windowStart, until: ev.end, message, url: PUBLIC_URL };
      }
    }
    return inactive(params);
  });
}

module.exports = { id: 'soldes-outremer', paramsSchema, checkWithParams };
