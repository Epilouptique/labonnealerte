// Source PARAMÉTRÉE (OpenAlert v2) : rappel daté personnel, RÉCURRENT chaque année.
// « Créez votre propre alerte datée » — préfigure la famille des veilles datées V3.
// ZÉRO API : tout est calculé. Le libellé est du texte UTILISATEUR affiché UNIQUEMENT
// dans les notifications de son auteur (aucune exposition publique).
//
// Format strict du paramètre : "JJ/MM Libellé" (ex. « 14/02 Anniversaire de maman »).
//   - date validée réellement (31/02 rejeté ; 29/02 seulement les années bissextiles) ;
//   - libellé 1-40 caractères, SANS « / » ni « @ » (garde-fou anti-URL/anti-email par
//     prudence, même si le libellé n'est jamais rendu comme un lien).
// Fenêtre : J-3 → jour J. Message 🔔.
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }.

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_URL = 'https://labonnealerte.fr/';
const ANNOUNCE_DAYS = 3;

// JJ (01-31) / MM (01-12) espace, puis libellé sans / ni @.
const RE = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2]) ([^/@]{1,40})$/;

const paramsSchema = [
  {
    key: 'rappel',
    label: 'Rappel daté',
    type: 'string',
    placeholder: '14/02 Anniversaire de maman',
    // Miroir de RE (le validateur interne honore le pattern des schémas de confiance).
    pattern: '^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2]) [^/@]{1,40}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'format JJ/MM Libellé, ex. 14/02 Anniversaire de maman (rappel annuel)',
  },
];

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInMonth(y, m /* 1-12 */) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Prochaine occurrence (année en cours si pas dépassée, sinon l'an prochain) qui existe
// réellement (gère le 29/02 : on saute aux années bissextiles).
function nextOccurrence(day, month, now) {
  for (let y = now.getFullYear(); y <= now.getFullYear() + 8; y++) {
    if (day > daysInMonth(y, month)) continue; // 29/02 hors bissextile → année suivante
    const occ = new Date(y, month - 1, day);
    const activeEnd = new Date(y, month - 1, day, 23, 59);
    if (now.getTime() <= activeEnd.getTime()) return occ;
  }
  return null;
}

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  return combos.map((params) => {
    const raw = String((params && params.rappel) || '').trim();
    const m = RE.exec(raw);
    if (!m) return inactive(params);
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const libelle = m[3].trim();
    if (!libelle) return inactive(params);

    const occ = nextOccurrence(day, month, now);
    if (!occ) return inactive(params);
    const activeEnd = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate(), 23, 59);
    const windowStart = new Date(occ.getTime() - ANNOUNCE_DAYS * DAY_MS);
    if (now.getTime() < windowStart.getTime()) return inactive(params);

    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((occ.getTime() - d0.getTime()) / DAY_MS);
    const when = diff <= 0 ? "Aujourd'hui" : (diff === 1 ? 'Demain' : `Dans ${diff} jours`);

    return {
      params,
      state: 'active',
      since: windowStart,
      until: activeEnd,
      message: `🔔 ${when} : ${libelle}`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'rappel-personnalise', paramsSchema, checkWithParams };
