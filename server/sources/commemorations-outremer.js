// Source PARAMÉTRÉE (OpenAlert v2) : commémorations LOCALES de l'abolition de
// l'esclavage en outre-mer. Territoire au choix de l'abonné. ZÉRO API.
//
// Chaque territoire a SA date propre — À NE JAMAIS CONFONDRE entre elles ni avec
// la journée NATIONALE du 10 mai (portée par fetes-laiques.js) :
//   • Guadeloupe : 27 mai      • Martinique : 22 mai
//   • Guyane     : 10 juin     • La Réunion : 20 décembre (Fèt Kaf)
//   • Mayotte    : 27 avril
// Dates fixes annuelles (décrets locaux). Source officielle : service-public.gouv.fr
// (« Commémoration de l'abolition de l'esclavage »), vérifiée le 19/07/2026.
// Fenêtre d'annonce J-7 → jour J.

const { formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCE_DAYS = 7;
const PUBLIC_URL = 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1876';

// m = mois 1-based, d = jour. nom = intitulé propre au territoire.
const TERRITOIRES = [
  { value: 'guadeloupe', label: 'Guadeloupe', m: 5, d: 27, nom: "l'abolition de l'esclavage en Guadeloupe" },
  { value: 'martinique', label: 'Martinique', m: 5, d: 22, nom: "l'abolition de l'esclavage en Martinique" },
  { value: 'guyane', label: 'Guyane', m: 6, d: 10, nom: "l'abolition de l'esclavage en Guyane" },
  { value: 'reunion', label: 'La Réunion', m: 12, d: 20, nom: "l'abolition de l'esclavage à La Réunion (Fèt Kaf)" },
  { value: 'mayotte', label: 'Mayotte', m: 4, d: 27, nom: "l'abolition de l'esclavage à Mayotte" },
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

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  const y = now.getFullYear();

  return combos.map((params) => {
    const t = BY_VALUE[String((params && params.territoire) || '')];
    if (!t) return inactive(params);
    for (const year of [y, y + 1]) {
      const start = new Date(year, t.m - 1, t.d);
      const activeEnd = new Date(start.getTime() + DAY_MS);
      const windowStart = new Date(start.getTime() - ANNOUNCE_DAYS * DAY_MS);
      if (now >= windowStart && now <= activeEnd) {
        const phase = now < start ? 'before' : 'during';
        const quand = phase === 'during' ? "c'est aujourd'hui" : 'le ' + formatAvecJour(start);
        return {
          params,
          state: 'active',
          since: windowStart,
          until: activeEnd,
          message: '🕊️ ' + t.label + ' : commémoration de ' + t.nom + ', ' + quand +
            '. (Commémoration locale, distincte de la journée nationale du 10 mai.)',
          url: PUBLIC_URL,
        };
      }
    }
    return inactive(params);
  });
}

module.exports = { id: 'commemorations-outremer', paramsSchema, checkWithParams };
