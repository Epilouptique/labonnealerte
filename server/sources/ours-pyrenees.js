// Source PARAMÉTRÉE (OpenAlert v2) : suivi de l'ours brun des Pyrénées (OFB / Réseau Ours
// Brun), RÉGION au choix parmi les 2 concernées. Zéro API : source calculée qui s'active
// dans la fenêtre de publication ANNUELLE du bilan, invitant à consulter le rapport officiel.
//
// PÉRIMÈTRE : phénomène strictement pyrénéen → enum à 2 valeurs uniquement, les NOMS EXACTS
// de server/geo.js (pré-remplissage profil par région) :
//   • 'Occitanie'          (Ariège surtout)
//   • 'Nouvelle-Aquitaine' (Béarn / Pyrénées-Atlantiques)
//
// CONTEXTE OFFICIEL (vérifié au 21/07/2026) : l'OFB / Réseau Ours Brun publie chaque année
// au PRINTEMPS (mars/avril) le rapport annuel « Ours infos » (bilan du suivi : effectif,
// portées, aire de répartition), complété par la lettre saisonnière « L'Écho des tanières ».
// Séquence vérifiée : Ours infos 2021→2024 publiés mars/avril, rapport sur données 2025 en 2026.
//   Pages officielles : ofb.gouv.fr/reseau-ours-brun · ofb.gouv.fr/doc/ours-infos-2025-rapport-annuel
//
// ⚠️ TODO daté : la DATE EXACTE de publication du prochain « Ours infos » n'est pas annoncée
//   à l'avance. On active donc une FENÊTRE de printemps (avril) reflétant la cadence établie,
//   avec un message qui dit « paraît au printemps » (aucune date précise inventée). Dès qu'une
//   date/URL de publication est confirmée, la remplacer ici par un événement daté précis.

const { REGION_DEPTS } = require('../geo');
const { formatJourMois } = require('./lib/calendar-factory');

const PUBLIC_URL = 'https://www.ofb.gouv.fr/reseau-ours-brun';
const DAY_MS = 24 * 60 * 60 * 1000;

// Régions concernées (noms exacts geo.js) — enum limité à 2.
const REGIONS = ['Occitanie', 'Nouvelle-Aquitaine'];

const paramsSchema = [
  {
    key: 'region',
    label: 'Région',
    type: 'enum',
    values: REGIONS.map((r) => ({ value: r, label: r })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Fenêtre de publication annuelle : tout le mois d'avril (cadence établie mars/avril),
// année en cours et suivante. Renvoie la fenêtre active courante, ou null.
function activeWindow(now) {
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const start = new Date(year, 3, 1);          // 1er avril
    const end = new Date(year, 3, 30, 23, 59);   // 30 avril
    if (now >= start && now <= end) return { start, end };
  }
  return null;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  const now = new Date();
  const win = activeWindow(now);

  return combos.map((params) => {
    const region = String((params && params.region) || '');
    if (!REGION_DEPTS[region] || !REGIONS.includes(region)) return inactive(params);
    if (!win) return inactive(params);
    return {
      params,
      state: 'active',
      since: win.start,
      until: win.end,
      message: `🐻 Ours brun des Pyrénées (${region}) : le bilan annuel du Réseau Ours Brun (OFB) paraît au printemps — « Ours infos » à consulter sur ofb.gouv.fr.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'ours-pyrenees', paramsSchema, checkWithParams };
