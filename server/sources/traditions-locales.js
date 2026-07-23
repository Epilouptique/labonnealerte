// Source PARAMÉTRÉE ENUM (OpenAlert v2) — vague « villes » : traditions & fêtes propres à UNE
// ville. L'abonné choisit les traditions qu'il veut suivre (multiple) → sentiment de proximité,
// plutôt qu'un broadcast des 13 événements. Zéro API : dates calculées, fenêtre d'annonce J-3.
//
// RÈGLE Bison Futé : toutes les dates ci-dessous ont été VÉRIFIÉES sur source officielle
// (mairie / office de tourisme / organisateur) le 21/07/2026. Aucune date de mémoire.
//
// ⚠️ TODO DATÉS — événements réels dont l'édition à venir N'EST PAS encore publiée
//   officiellement (à ajouter comme valeurs enum dès parution des dates) :
//     • Fêtes de Bayonne — 2027 non publié (fetes.bayonne.fr).
//     • Féria de Pentecôte — Nîmes — mai 2027 non daté (feriadenimes.com) [≠ Féria des
//       Vendanges, elle CONFIRMÉE ci-dessous].
//     • Carnaval de Dunkerque (Trois Joyeuses) — ~7-9 février 2027 non officiel. ⚠️⚠️ NE JAMAIS
//       afficher de mention UNESCO : Dunkerque N'EST PAS inscrit à l'UNESCO (seul Granville
//       l'est parmi les carnavals français). C'est un patrimoine culturel immatériel NATIONAL.
//     • Fêtes de Gayant — Douai — 2027 non publié. Celle-ci EST inscrite UNESCO 2008 (« Géants
//       et dragons processionnels ») : inclure la mention UNESCO une fois activée.
//     • Braderie de Wazemmes — Lille — printemps 2027 non publié. BIEN DISTINCTE de la
//       « Braderie de Lille » (septembre, déjà en prod dans braderie-lille.js) : ne pas confondre.
//     • Étonnants Voyageurs — Saint-Malo — 2027 non publié (etonnants-voyageurs.com).
//     • Fêtes johanniques — Orléans — autour du 8 mai (fixe a priori), amplitude 2027 à confirmer.
//
// ⚠️ Ostensions Limousines : NON codées ici — tradition septennale, prochaine occurrence en
//   2030 (25 juin-1er juil 2030 à Saint-Junien, confirmé) : trop lointain. À réintégrer à
//   l'approche de 2030 (chaque commune ostensionnaire a ses propres dates).

const { formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCE_DAYS = 3;

// value → { label, emoji, url, windows: [[y,m(0-based),d1, y2,m2,d2], …], note? }.
// Chaque événement peut avoir PLUSIEURS fenêtres (ex. Mirabelle de Metz, deux week-ends).
const EVENTS = {
  'feria-beziers': {
    label: 'Féria de Béziers', emoji: '🐂',
    url: 'https://www.arenes-beziers.com/', windows: [[2026, 7, 12, 2026, 7, 16]],
  },
  'feria-vendanges-nimes': {
    label: 'Féria des Vendanges de Nîmes', emoji: '🍇',
    url: 'https://www.feriadenimes.com/', windows: [[2026, 8, 18, 2026, 8, 20]],
  },
  'carnaval-nice': {
    label: 'Carnaval de Nice', emoji: '🎭',
    url: 'https://www.nicecarnaval.com/', windows: [[2027, 1, 9, 2027, 1, 28]],
    // TODO : dates précises des corsos (illuminé, corso fleuri, bataille de fleurs) non publiées.
  },
  'fete-citron-menton': {
    label: 'Fête du Citron de Menton', emoji: '🍋',
    url: 'https://www.fete-du-citron.com/', windows: [[2027, 1, 13, 2027, 1, 28]],
    // TODO : dates précises des corsos (dimanches / jeudis nocturnes) non publiées.
  },
  'pardon-sainte-anne-auray': {
    label: "Grand Pardon de Sainte-Anne-d'Auray", emoji: '⛪',
    url: 'https://www.sainteanne-sanctuaire.com/', windows: [[2026, 6, 25, 2026, 6, 26]],
  },
  'remparts-dinan': {
    label: 'Fête des Remparts de Dinan', emoji: '🏰',
    url: 'https://www.fete-remparts-dinan.com/', windows: [[2027, 6, 24, 2027, 6, 25]],
    // Biennale (années impaires) : prochaine après 2027 = 2029.
  },
  'foire-vins-colmar': {
    label: 'Foire aux vins de Colmar', emoji: '🍷',
    url: 'https://www.foire-colmar.com/', windows: [[2026, 6, 31, 2026, 7, 9]],
  },
  'mirabelle-metz': {
    label: 'Fête de la Mirabelle de Metz', emoji: '🟡',
    url: 'https://www.tourisme-metz.com/', windows: [[2026, 7, 21, 2026, 7, 23], [2026, 7, 29, 2026, 7, 30]],
  },
  'trois-glorieuses-beaune': {
    label: 'Trois Glorieuses de Beaune', emoji: '🍷',
    url: 'https://www.hospices-de-beaune.com/', windows: [[2026, 10, 14, 2026, 10, 16]],
    note: 'vente aux enchères des vins des Hospices le 15 novembre',
  },
  'vendanges-montmartre': {
    label: 'Fête des Vendanges de Montmartre', emoji: '🍇',
    url: 'https://fetedesvendangesdemontmartre.com/', windows: [[2026, 9, 7, 2026, 9, 11]],
  },
  'foire-marseille': {
    label: 'Foire Internationale de Marseille', emoji: '🎪',
    url: 'https://www.foiredemarseille.com/', windows: [[2026, 8, 25, 2026, 9, 5]],
  },
  'marathon-medoc': {
    label: 'Marathon du Médoc', emoji: '🍷',
    url: 'https://www.marathondumedoc.com/', windows: [[2026, 8, 5, 2026, 8, 5]],
    note: 'le marathon costumé entre les châteaux, un jour de fête',
  },
  'nuits-sonores-lyon': {
    label: 'Nuits Sonores à Lyon', emoji: '🎧',
    url: 'https://nuits-sonores.com/', windows: [[2027, 4, 5, 2027, 4, 9]],
  },
};

const paramsSchema = [
  {
    key: 'tradition',
    label: 'Tradition',
    type: 'enum',
    values: Object.keys(EVENTS).map((v) => ({ value: v, label: EVENTS[v].label })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params, url) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: url || 'https://labonnealerte.fr' };
}

// "12 au 16 août" / "5 septembre" à partir d'une fenêtre [y,m,d1,y2,m2,d2].
function rangeLabel(w) {
  const a = new Date(w[0], w[1], w[2]);
  const b = new Date(w[3], w[4], w[5]);
  if (a.getTime() === b.getTime()) return formatJourMois(a);
  return `${a.getDate()} au ${formatJourMois(b)}`;
}

// Fenêtre active courante d'un événement (annonce J-3 → dernier jour), ou null.
function activeOf(ev, now) {
  for (const w of ev.windows) {
    const start = new Date(w[0], w[1], w[2]);
    const end = new Date(new Date(w[3], w[4], w[5]).getTime() + DAY_MS); // fin de journée du dernier jour
    const announce = new Date(start.getTime() - ANNOUNCE_DAYS * DAY_MS);
    if (now >= announce && now <= end) {
      return { start, end, announce, phase: now < start ? 'before' : 'during', range: rangeLabel(w) };
    }
  }
  return null;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  const now = new Date();

  return combos.map((params) => {
    const key = String((params && params.tradition) || '');
    const ev = EVENTS[key];
    if (!ev) return inactive(params);
    const win = activeOf(ev, now);
    if (!win) return inactive(params, ev.url);
    const suffix = ev.note ? ` — ${ev.note}` : '';
    const message = win.phase === 'before'
      ? `${ev.emoji} Bientôt : ${ev.label} (${win.range})${suffix}.`
      : `${ev.emoji} En ce moment : ${ev.label}${suffix}.`;
    return { params, state: 'active', since: win.announce, until: win.end, message, url: ev.url };
  });
}

module.exports = { id: 'traditions-locales', paramsSchema, checkWithParams };
