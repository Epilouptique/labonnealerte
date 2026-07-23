// Source PARAMÉTRÉE ENUM (OpenAlert v2) — vague « villes » : grands marathons / courses des
// grandes villes. L'abonné choisit la ou les courses à suivre (multiple). Zéro API : dates
// calculées, fenêtre d'annonce J-7 (une course urbaine s'anticipe : dossards, accès, transports).
//
// RÈGLE Bison Futé : dates VÉRIFIÉES sur le site officiel de chaque course le 21/07/2026.
//
// ⚠️ TODO DATÉS — courses réelles dont la date à venir n'est pas encore fixée officiellement
//   (à ajouter comme valeurs enum dès parution) :
//     • Marathon de Marseille / Run in Marseille — fin mars 2027, jour non arrêté. ⚠️ À NE PAS
//       confondre avec le Marseille-Cassis (semi de 20 km, octobre) : événement DIFFÉRENT.
//     • Marathon de Nantes — 2027 sans date publiée (marathondenantes.com).

const { formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCE_DAYS = 7;

// value → { label, emoji, url, y, m (0-based), d } (course sur un seul jour).
const COURSES = {
  'marathon-paris': { label: 'Marathon de Paris', emoji: '🏃', url: 'https://www.schneiderelectricparismarathon.com/', y: 2027, m: 3, d: 11 },
  'semi-paris': { label: 'Semi-marathon de Paris', emoji: '🏃', url: 'https://www.hokasemideparis.fr/', y: 2027, m: 2, d: 7 },
  'run-in-lyon': { label: 'Run in Lyon (marathon)', emoji: '🏃', url: 'https://www.runinlyon.com/', y: 2026, m: 9, d: 4 },
  '20km-paris': { label: '20 km de Paris', emoji: '🏃', url: 'https://www.20kmparis.com/', y: 2026, m: 9, d: 11 },
};

const paramsSchema = [
  {
    key: 'course',
    label: 'Course',
    type: 'enum',
    values: Object.keys(COURSES).map((v) => ({ value: v, label: COURSES[v].label })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params, url) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: url || 'https://labonnealerte.fr' };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  const now = new Date();

  return combos.map((params) => {
    const key = String((params && params.course) || '');
    const c = COURSES[key];
    if (!c) return inactive(params);
    const start = new Date(c.y, c.m, c.d);
    const end = new Date(start.getTime() + DAY_MS); // jour de la course inclus
    const announce = new Date(start.getTime() - ANNOUNCE_DAYS * DAY_MS);
    if (now < announce || now > end) return inactive(params, c.url);
    const message = now < start
      ? `${c.emoji} Bientôt : ${c.label}, ${formatAvecJour(start)}.`
      : `${c.emoji} Aujourd'hui : ${c.label} !`;
    return { params, state: 'active', since: announce, until: end, message, url: c.url };
  });
}

module.exports = { id: 'marathons-villes', paramsSchema, checkWithParams };
