// Source PARAMÉTRÉE (OpenAlert v2) : la fête du prénom (« Demain, c'est la fête des
// Hugo »). LE concept viral français. ZÉRO API : table interne curée du calendrier des
// Postes (référence stable, concordante entre sources ; échantillon vérifié : Hugo 1er
// avril, Valentin 14 février, Catherine 25 novembre, Nicolas 6 décembre, Sylvestre 31
// décembre). Fenêtre : veille + jour J. Ton chaleureux, formulation NEUTRE en genre
// (pas de « Saint/Sainte » — évite tout écueil masculin/féminin).
//
// Prénom absent de la table → instance « inactive » propre (le formulaire prévient que
// le prénom n'est pas répertorié). Variantes courantes mappées vers l'entrée canonique.
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }.

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_URL = 'https://www.service-public.fr/';
const ANNOUNCE_DAYS = 1; // veille + jour J

// Table canonique : prénom normalisé (minuscule, sans accent) → [mois 0-based, jour].
// Curée sur le calendrier des Postes ; centrée sur les prénoms usuels.
const PRENOMS = {
  // Janvier
  'basile': [0, 2],
  'genevieve': [0, 3],
  'odilon': [0, 4],
  'edouard': [0, 5],
  'raymond': [0, 7],
  'lucien': [0, 8],
  'alix': [0, 9],
  'guillaume': [0, 10],
  'pauline': [0, 11],
  'tatiana': [0, 12],
  'yvette': [0, 13],
  'nina': [0, 14],
  'remi': [0, 15],
  'marcel': [0, 16],
  'roseline': [0, 17],
  'prisca': [0, 18],
  'marius': [0, 19],
  'sebastien': [0, 20],
  'agnes': [0, 21],
  'paule': [0, 26],
  'angele': [0, 27],
  'gildas': [0, 29],
  'martine': [0, 30],
  'marcelle': [0, 31],

  // Février
  'ella': [1, 1],
  'blaise': [1, 3],
  'veronique': [1, 4],
  'agathe': [1, 5],
  'gaston': [1, 6],
  'eugenie': [1, 7],
  'jacqueline': [1, 8],
  'apolline': [1, 9],
  'arnaud': [1, 10],
  'felix': [1, 12],
  'beatrice': [1, 13],
  'valentin': [1, 14],
  'claude': [1, 15],
  'julienne': [1, 16],
  'alexis': [1, 17],
  'bernadette': [1, 18],
  'gabin': [1, 19],
  'aimee': [1, 20],
  'isabelle': [1, 22],
  'lazare': [1, 23],
  'modeste': [1, 24],
  'romeo': [1, 25],
  'nestor': [1, 26],
  'honorine': [1, 27],
  'romain': [1, 28],

  // Mars
  'aubin': [2, 1],
  'guenole': [2, 3],
  'casimir': [2, 4],
  'olive': [2, 5],
  'colette': [2, 6],
  'felicite': [2, 7],
  'francoise': [2, 9],
  'vivien': [2, 10],
  'rosine': [2, 11],
  'justine': [2, 12],
  'rodrigue': [2, 13],
  'mathilde': [2, 14],
  'louise': [2, 15],
  'benedicte': [2, 16],
  'patrice': [2, 17],
  'cyrille': [2, 18],
  'joseph': [2, 19],
  'herbert': [2, 20],
  'clemence': [2, 21],
  'lea': [2, 22],
  'victorien': [2, 23],
  'karine': [2, 24],
  'larissa': [2, 26],
  'habib': [2, 27],
  'gontran': [2, 28],
  'gwladys': [2, 29],
  'amedee': [2, 30],
  'benjamin': [2, 31],

  // Avril
  'hugues': [3, 1],
  'sandrine': [3, 2],
  'richard': [3, 3],
  'isidore': [3, 4],
  'irene': [3, 5],
  'marcellin': [3, 6],
  'jean-baptiste': [3, 7],
  'julie': [3, 8],
  'gautier': [3, 9],
  'fulbert': [3, 10],
  'stanislas': [3, 11],
  'jules': [3, 12],
  'ida': [3, 13],
  'maxime': [3, 14],
  'paterne': [3, 15],
  'anicet': [3, 17],
  'parfait': [3, 18],
  'emma': [3, 19],
  'odette': [3, 20],
  'anselme': [3, 21],
  'alexandre': [3, 22],
  'georges': [3, 23],
  'fidele': [3, 24],
  'marc': [3, 25],
  'alida': [3, 26],
  'zita': [3, 27],
  'valerie': [3, 28],
  'robert': [3, 30],

  // Mai
  'boris': [4, 2],
  'philippe': [4, 3],
  'sylvain': [4, 4],
  'judith': [4, 5],
  'prudence': [4, 6],
  'gisele': [4, 7],
  'pacome': [4, 9],
  'solange': [4, 10],
  'estelle': [4, 11],
  'achille': [4, 12],
  'rolande': [4, 13],
  'matthias': [4, 14],
  'denise': [4, 15],
  'honore': [4, 16],
  'pascal': [4, 17],
  'eric': [4, 18],
  'yves': [4, 19],
  'bernardin': [4, 20],
  'constantin': [4, 21],
  'emile': [4, 22],
  'didier': [4, 23],
  'donatien': [4, 24],
  'sophie': [4, 25],
  'berenger': [4, 26],
  'germain': [4, 28],
  'aymard': [4, 29],
  'ferdinand': [4, 30],
  'petronille': [4, 31],

  // Juin
  'justin': [5, 1],
  'blandine': [5, 2],
  'kevin': [5, 3],
  'clotilde': [5, 4],
  'igor': [5, 5],
  'norbert': [5, 6],
  'gilbert': [5, 7],
  'medard': [5, 8],
  'diane': [5, 9],
  'landry': [5, 10],
  'barnabe': [5, 11],
  'guy': [5, 12],
  'antoine': [5, 13],
  'elisee': [5, 14],
  'germaine': [5, 15],
  'jean-francois': [5, 16],
  'herve': [5, 17],
  'leonce': [5, 18],
  'romuald': [5, 19],
  'silvere': [5, 20],
  'rodolphe': [5, 21],
  'alban': [5, 22],
  'audrey': [5, 23],
  'jean': [5, 24],
  'prosper': [5, 25],
  'anthelme': [5, 26],
  'fernand': [5, 27],
  'irenee': [5, 28],
  'paul': [5, 29],
  'pierre': [5, 29],
  'martial': [5, 30],

  // Juillet
  'thierry': [6, 1],
  'martinien': [6, 2],
  'thomas': [6, 3],
  'florent': [6, 4],
  'mariette': [6, 6],
  'raoul': [6, 7],
  'thibaut': [6, 8],
  'amandine': [6, 9],
  'ulrich': [6, 10],
  'benoit': [6, 11],
  'olivier': [6, 12],
  'henri': [6, 13],
  'camille': [6, 14],
  'donald': [6, 15],
  'charlotte': [6, 17],
  'frederic': [6, 18],
  'arsene': [6, 19],
  'marina': [6, 20],
  'victor': [6, 21],
  'marie-madeleine': [6, 22],
  'brigitte': [6, 23],
  'christine': [6, 24],
  'jacques': [6, 25],
  'anne': [6, 26],
  'nathalie': [6, 27],
  'samson': [6, 28],
  'marthe': [6, 29],
  'juliette': [6, 30],
  'ignace': [6, 31],

  // Août
  'alphonse': [7, 1],
  'julien': [7, 2],
  'lydie': [7, 3],
  'jean-marie': [7, 4],
  'abel': [7, 5],
  'gaetan': [7, 7],
  'dominique': [7, 8],
  'amour': [7, 9],
  'laurent': [7, 10],
  'claire': [7, 11],
  'clarisse': [7, 12],
  'hippolyte': [7, 13],
  'evrard': [7, 14],
  'marie': [7, 15],
  'armel': [7, 16],
  'hyacinthe': [7, 17],
  'helene': [7, 18],
  'jean-eudes': [7, 19],
  'bernard': [7, 20],
  'christophe': [7, 21],
  'fabrice': [7, 22],
  'rose': [7, 23],
  'barthelemy': [7, 24],
  'louis': [7, 25],
  'natacha': [7, 26],
  'monique': [7, 27],
  'augustin': [7, 28],
  'sabine': [7, 29],
  'fiacre': [7, 30],
  'aristide': [7, 31],

  // Septembre
  'gilles': [8, 1],
  'ingrid': [8, 2],
  'gregoire': [8, 3],
  'rosalie': [8, 4],
  'raissa': [8, 5],
  'bertrand': [8, 6],
  'reine': [8, 7],
  'adrien': [8, 8],
  'alain': [8, 9],
  'ines': [8, 10],
  'apollinaire': [8, 12],
  'aime': [8, 13],
  'roland': [8, 15],
  'edith': [8, 16],
  'renaud': [8, 17],
  'nadege': [8, 18],
  'emilie': [8, 19],
  'davy': [8, 20],
  'matthieu': [8, 21],
  'maurice': [8, 22],
  'constant': [8, 23],
  'hermann': [8, 25],
  'come': [8, 26],
  'vincent': [8, 27],
  'michel': [8, 29],
  'jerome': [8, 30],

  // Octobre
  'therese': [9, 1],
  'leger': [9, 2],
  'gerard': [9, 3],
  'francois': [9, 4],
  'fleur': [9, 5],
  'bruno': [9, 6],
  'serge': [9, 7],
  'pelagie': [9, 8],
  'denis': [9, 9],
  'ghislain': [9, 10],
  'firmin': [9, 11],
  'wilfried': [9, 12],
  'geraud': [9, 13],
  'juste': [9, 14],
  'edwige': [9, 16],
  'baudouin': [9, 17],
  'luc': [9, 18],
  'rene': [9, 19],
  'adeline': [9, 20],
  'celine': [9, 21],
  'elodie': [9, 22],
  'florentin': [9, 24],
  'crepin': [9, 25],
  'dimitri': [9, 26],
  'emeline': [9, 27],
  'simon': [9, 28],
  'narcisse': [9, 29],
  'quentin': [9, 31],

  // Novembre
  'hubert': [10, 3],
  'charles': [10, 4],
  'sylvie': [10, 5],
  'bertille': [10, 6],
  'carine': [10, 7],
  'geoffroy': [10, 8],
  'theodore': [10, 9],
  'leon': [10, 10],
  'martin': [10, 11],
  'christian': [10, 12],
  'brice': [10, 13],
  'albert': [10, 15],
  'marguerite': [10, 16],
  'elisabeth': [10, 17],
  'aude': [10, 18],
  'tanguy': [10, 19],
  'edmond': [10, 20],
  'cecile': [10, 22],
  'clement': [10, 23],
  'flora': [10, 24],
  'catherine': [10, 25],
  'delphine': [10, 26],
  'severin': [10, 27],
  'saturnin': [10, 29],
  'andre': [10, 30],

  // Décembre
  'florence': [11, 1],
  'viviane': [11, 2],
  'francois-xavier': [11, 3],
  'barbara': [11, 4],
  'gerald': [11, 5],
  'nicolas': [11, 6],
  'ambroise': [11, 7],
  'romaric': [11, 10],
  'daniel': [11, 11],
  'chantal': [11, 12],
  'lucie': [11, 13],
  'odile': [11, 14],
  'ninon': [11, 15],
  'alice': [11, 16],
  'gael': [11, 17],
  'gatien': [11, 18],
  'urbain': [11, 19],
  'theophile': [11, 20],
  'armand': [11, 23],
  'adele': [11, 24],
  'etienne': [11, 26],
  'david': [11, 29],
  'roger': [11, 30],
  'sylvestre': [11, 31],
};

// Variantes courantes → clé canonique de PRENOMS.
const VARIANTES = {
  maria: 'marie', marion: 'marie', manon: 'marie', mary: 'marie',
  jeanne: 'jean', jane: 'jean', yann: 'jean', yannick: 'jean',
  pierrick: 'pierre', peter: 'pierre', petra: 'pierre',
  toni: 'antoine', antoinette: 'antoine', tonio: 'antoine',
  fanny: 'francoise', francis: 'francois', franck: 'francois', frank: 'francois',
  cathy: 'catherine', katia: 'catherine', karine: 'carine',
  steph: 'etienne', stephane: 'etienne', kiki: 'christophe', chris: 'christophe',
  nico: 'nicolas', nina: 'catherine', mika: 'michel',
  lisa: 'elisabeth', babeth: 'elisabeth', betty: 'elisabeth',
  loulou: 'louis', lou: 'louis', ludo: 'louis',
  jojo: 'joseph', jo: 'joseph', sophy: 'sophie',
  // Formes courantes vers l'entrée canonique de la table.
  hugo: 'hugues', leo: 'leon', theo: 'theodore', alex: 'alexandre',
  max: 'maxime', ben: 'benoit', tom: 'thomas', will: 'guillaume',
  vince: 'vincent', flo: 'florent', sam: 'samson',
};

const RE_PRENOM = /^[a-zà-öø-ÿ][a-zà-öø-ÿ'-]{1,24}$/i;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z'-]/g, '');
}
function cap(s) {
  return String(s || '').split('-').map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1) : p).join('-');
}

const paramsSchema = [
  {
    key: 'prenom',
    label: 'Prénom',
    type: 'string',
    placeholder: 'Hugo',
    pattern: "^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,24}$",
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'un prénom du calendrier français, ex. Hugo, Marie, Nicolas',
  },
];

function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  return combos.map((params) => {
    const raw = String((params && params.prenom) || '').trim();
    if (!RE_PRENOM.test(raw)) return inactive(params);
    const key = norm(raw);
    const canon = PRENOMS[key] ? key : (VARIANTES[key] && PRENOMS[VARIANTES[key]] ? VARIANTES[key] : null);
    if (!canon) return inactive(params); // prénom non répertorié
    const [mo, da] = PRENOMS[canon];

    // Occurrence courante ; si dépassée (au-delà du jour J), viser l'an prochain.
    let occ = new Date(now.getFullYear(), mo, da);
    let activeEnd = new Date(now.getFullYear(), mo, da, 23, 59);
    if (now.getTime() > activeEnd.getTime()) {
      occ = new Date(now.getFullYear() + 1, mo, da);
      activeEnd = new Date(now.getFullYear() + 1, mo, da, 23, 59);
    }
    const windowStart = new Date(occ.getTime() - ANNOUNCE_DAYS * DAY_MS);
    if (now.getTime() < windowStart.getTime()) return inactive(params);

    const label = cap(raw);
    const during = now.getTime() >= occ.getTime();
    return {
      params,
      state: 'active',
      since: windowStart,
      until: activeEnd,
      message: during
        ? `🎉 Bonne fête aux ${label} !`
        : `🎈 Demain, c'est la fête des ${label} — pensez à leur souhaiter !`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'fete-des-prenoms', paramsSchema, checkWithParams, _PRENOMS: PRENOMS };
