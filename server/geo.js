// Référentiel géographique pour la personnalisation de l'affichage.
// Source de vérité partagée : validation serveur (routes) + selects côté client
// (via GET /api/geo). Aucune valeur par défaut ici : la France n'est un défaut
// que dans l'UI.

// Liste courte de pays francophones (+ « Autre »). code ISO-2, sauf 'AUTRE'.
const COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'CA', name: 'Canada' },
  { code: 'MC', name: 'Monaco' },
  { code: 'AD', name: 'Andorre' },
  { code: 'AUTRE', name: 'Autre' },
];

// 101 départements français (métropole + Corse 2A/2B + DROM). Code en TEXT.
const DEPARTEMENTS = [
  { code: '01', name: 'Ain' }, { code: '02', name: 'Aisne' }, { code: '03', name: 'Allier' },
  { code: '04', name: 'Alpes-de-Haute-Provence' }, { code: '05', name: 'Hautes-Alpes' },
  { code: '06', name: 'Alpes-Maritimes' }, { code: '07', name: 'Ardèche' }, { code: '08', name: 'Ardennes' },
  { code: '09', name: 'Ariège' }, { code: '10', name: 'Aube' }, { code: '11', name: 'Aude' },
  { code: '12', name: 'Aveyron' }, { code: '13', name: 'Bouches-du-Rhône' }, { code: '14', name: 'Calvados' },
  { code: '15', name: 'Cantal' }, { code: '16', name: 'Charente' }, { code: '17', name: 'Charente-Maritime' },
  { code: '18', name: 'Cher' }, { code: '19', name: 'Corrèze' }, { code: '2A', name: 'Corse-du-Sud' },
  { code: '2B', name: 'Haute-Corse' }, { code: '21', name: "Côte-d'Or" }, { code: '22', name: "Côtes-d'Armor" },
  { code: '23', name: 'Creuse' }, { code: '24', name: 'Dordogne' }, { code: '25', name: 'Doubs' },
  { code: '26', name: 'Drôme' }, { code: '27', name: 'Eure' }, { code: '28', name: 'Eure-et-Loir' },
  { code: '29', name: 'Finistère' }, { code: '30', name: 'Gard' }, { code: '31', name: 'Haute-Garonne' },
  { code: '32', name: 'Gers' }, { code: '33', name: 'Gironde' }, { code: '34', name: 'Hérault' },
  { code: '35', name: 'Ille-et-Vilaine' }, { code: '36', name: 'Indre' }, { code: '37', name: 'Indre-et-Loire' },
  { code: '38', name: 'Isère' }, { code: '39', name: 'Jura' }, { code: '40', name: 'Landes' },
  { code: '41', name: 'Loir-et-Cher' }, { code: '42', name: 'Loire' }, { code: '43', name: 'Haute-Loire' },
  { code: '44', name: 'Loire-Atlantique' }, { code: '45', name: 'Loiret' }, { code: '46', name: 'Lot' },
  { code: '47', name: 'Lot-et-Garonne' }, { code: '48', name: 'Lozère' }, { code: '49', name: 'Maine-et-Loire' },
  { code: '50', name: 'Manche' }, { code: '51', name: 'Marne' }, { code: '52', name: 'Haute-Marne' },
  { code: '53', name: 'Mayenne' }, { code: '54', name: 'Meurthe-et-Moselle' }, { code: '55', name: 'Meuse' },
  { code: '56', name: 'Morbihan' }, { code: '57', name: 'Moselle' }, { code: '58', name: 'Nièvre' },
  { code: '59', name: 'Nord' }, { code: '60', name: 'Oise' }, { code: '61', name: 'Orne' },
  { code: '62', name: 'Pas-de-Calais' }, { code: '63', name: 'Puy-de-Dôme' },
  { code: '64', name: 'Pyrénées-Atlantiques' }, { code: '65', name: 'Hautes-Pyrénées' },
  { code: '66', name: 'Pyrénées-Orientales' }, { code: '67', name: 'Bas-Rhin' }, { code: '68', name: 'Haut-Rhin' },
  { code: '69', name: 'Rhône' }, { code: '70', name: 'Haute-Saône' }, { code: '71', name: 'Saône-et-Loire' },
  { code: '72', name: 'Sarthe' }, { code: '73', name: 'Savoie' }, { code: '74', name: 'Haute-Savoie' },
  { code: '75', name: 'Paris' }, { code: '76', name: 'Seine-Maritime' }, { code: '77', name: 'Seine-et-Marne' },
  { code: '78', name: 'Yvelines' }, { code: '79', name: 'Deux-Sèvres' }, { code: '80', name: 'Somme' },
  { code: '81', name: 'Tarn' }, { code: '82', name: 'Tarn-et-Garonne' }, { code: '83', name: 'Var' },
  { code: '84', name: 'Vaucluse' }, { code: '85', name: 'Vendée' }, { code: '86', name: 'Vienne' },
  { code: '87', name: 'Haute-Vienne' }, { code: '88', name: 'Vosges' }, { code: '89', name: 'Yonne' },
  { code: '90', name: 'Territoire de Belfort' }, { code: '91', name: 'Essonne' },
  { code: '92', name: 'Hauts-de-Seine' }, { code: '93', name: 'Seine-Saint-Denis' },
  { code: '94', name: 'Val-de-Marne' }, { code: '95', name: "Val-d'Oise" },
  { code: '971', name: 'Guadeloupe' }, { code: '972', name: 'Martinique' }, { code: '973', name: 'Guyane' },
  { code: '974', name: 'La Réunion' }, { code: '976', name: 'Mayotte' },
];

// Régions françaises (13 métropole + 5 DROM). Le nom EST la valeur stockée : la région
// est enregistrée en texte (subdivision IPLocate à l'auto-remplissage), pas en code — on
// conserve donc les noms officiels tels qu'IPLocate les renvoie. REGION_DEPTS : région →
// codes de départements qui la composent (source unique de la liaison dept↔région↔pays).
const REGION_DEPTS = {
  'Auvergne-Rhône-Alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'Bourgogne-Franche-Comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
  'Bretagne': ['22', '29', '35', '56'],
  'Centre-Val de Loire': ['18', '28', '36', '37', '41', '45'],
  'Corse': ['2A', '2B'],
  'Grand Est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'Hauts-de-France': ['02', '59', '60', '62', '80'],
  'Île-de-France': ['75', '77', '78', '91', '92', '93', '94', '95'],
  'Normandie': ['14', '27', '50', '61', '76'],
  'Nouvelle-Aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  'Occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'Pays de la Loire': ['44', '49', '53', '72', '85'],
  "Provence-Alpes-Côte d'Azur": ['04', '05', '06', '13', '83', '84'],
  'Guadeloupe': ['971'],
  'Martinique': ['972'],
  'Guyane': ['973'],
  'La Réunion': ['974'],
  'Mayotte': ['976'],
};

// Liste plate des régions (ordre du référentiel ci-dessus) pour alimenter un select.
const REGIONS = Object.keys(REGION_DEPTS).map((name) => ({ code: name, name }));

// Table inverse : code de département → nom de région (un département n'appartient qu'à
// une seule région).
const DEPT_REGION = {};
Object.keys(REGION_DEPTS).forEach((region) => {
  REGION_DEPTS[region].forEach((dep) => { DEPT_REGION[dep] = region; });
});

// DEPARTEMENTS enrichis de leur région (le client construit toute la liaison à partir de
// ce seul tableau). On n'altère pas l'objet source : on en dérive une copie augmentée.
const DEPARTEMENTS_WITH_REGION = DEPARTEMENTS.map((d) => ({ ...d, region: DEPT_REGION[d.code] || null }));

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const DEPARTEMENT_CODES = new Set(DEPARTEMENTS.map((d) => d.code));
const REGION_NAMES = new Set(REGIONS.map((r) => r.code));

function isValidCountry(code) { return COUNTRY_CODES.has(code); }
function isValidDepartement(code) { return DEPARTEMENT_CODES.has(code); }
function isValidRegion(name) { return REGION_NAMES.has(name); }
function regionFromDept(code) { return DEPT_REGION[code] || null; }

// ── LOCATIF D'UN DÉPARTEMENT (« dans les Hautes-Alpes », « dans le Var », « dans la
//    Drôme », « dans l'Aisne », « en Haute-Corse », « à Paris ») ────────────────────
//
// POURQUOI ICI. Les messages d'alerte géolocalisés écrivaient « dans le ${nom} », juste
// pour la quinzaine de départements masculins et faux partout ailleurs (« dans le
// Hautes-Alpes », « dans le Moselle »). Deux sources avaient contourné le problème en
// mettant le nom du département EN TÊTE, sans article (meteo-forets, pollens) ; c'est
// une solution acceptable mais elle appauvrit la phrase. L'article français n'est pas
// devinable depuis le nom, mais il est FINI : 101 départements, une forme chacun. On la
// déclare donc une fois, au même endroit que le référentiel, plutôt que dans chaque source.
//
// FORME DÉCLARÉE : un code par département, d'où la locution est dérivée —
//   'm' → dans le …   'f' → dans la …   'v' → dans l'… (voyelle ou h muet)   'p' → dans les …
// Les cas qui ne suivent aucune de ces règles (Paris, Corse, DROM) portent directement
// leur locution complète. Vérifié département par département.
const DEPT_LOCATIF_FORME = {
  '01': 'v', '02': 'v', '03': 'v', '04': 'p', '05': 'p', '06': 'p', '07': 'v', '08': 'p',
  '09': 'v', '10': 'v', '11': 'v', '12': 'v', '13': 'p', '14': 'm', '15': 'm', '16': 'f',
  '17': 'f', '18': 'm', '19': 'f', '2A': 'en Corse-du-Sud', '2B': 'en Haute-Corse',
  '21': 'f', '22': 'p', '23': 'f', '24': 'f', '25': 'm', '26': 'f', '27': 'v', '28': 'v',
  '29': 'm', '30': 'm', '31': 'f', '32': 'm', '33': 'f', '34': 'v', '35': 'v', '36': 'v',
  '37': 'v', '38': 'v', '39': 'm', '40': 'p', '41': 'm', '42': 'f', '43': 'f', '44': 'f',
  '45': 'm', '46': 'm', '47': 'm', '48': 'f', '49': 'm', '50': 'f', '51': 'f', '52': 'f',
  '53': 'f', '54': 'f', '55': 'f', '56': 'm', '57': 'f', '58': 'f', '59': 'm', '60': 'v',
  '61': 'v', '62': 'm', '63': 'm', '64': 'p', '65': 'p', '66': 'p', '67': 'm', '68': 'm',
  '69': 'm', '70': 'f', '71': 'f', '72': 'f', '73': 'f', '74': 'f', '75': 'à Paris',
  '76': 'f', '77': 'f', '78': 'p', '79': 'p', '80': 'f', '81': 'm', '82': 'm', '83': 'm',
  '84': 'm', '85': 'f', '86': 'f', '87': 'f', '88': 'p', '89': 'v', '90': 'm', '91': 'v',
  '92': 'p', '93': 'f', '94': 'm', '95': 'm',
  '971': 'en Guadeloupe', '972': 'en Martinique', '973': 'en Guyane',
  '974': 'à La Réunion', '976': 'à Mayotte',
};

/**
 * Locution de lieu d'un département, article compris : « dans les Hautes-Alpes »,
 * « dans le Var », « dans la Drôme », « dans l'Aisne », « en Haute-Corse », « à Paris ».
 * Code inconnu → repli neutre « dans le département <code> » (jamais de phrase fausse).
 * @param {string} code code département ('05', '2A', '974'…)
 * @returns {string}
 */
function locatifDepartement(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  const forme = DEPT_LOCATIF_FORME[c];
  const nom = (DEPARTEMENTS.find((d) => d.code === c) || {}).name;
  if (!forme || !nom) return `dans le département ${c || '?'}`;
  if (forme === 'm') return `dans le ${nom}`;
  if (forme === 'f') return `dans la ${nom}`;
  if (forme === 'v') return `dans l'${nom}`;
  if (forme === 'p') return `dans les ${nom}`;
  return forme; // locution complète déjà écrite (Paris, Corse, DROM)
}

module.exports = {
  COUNTRIES, DEPARTEMENTS, DEPARTEMENTS_WITH_REGION, REGIONS, REGION_DEPTS, DEPT_REGION,
  isValidCountry, isValidDepartement, isValidRegion, regionFromDept,
  locatifDepartement, DEPT_LOCATIF_FORME,
};
