// Taxonomie fermée des catégories d'annuaire du kiosque (tags, max 3 par source).
// Hors standard OpenAlert : donnée de plateforme. Structure : { slug, label, group }.
// Les labels français sont générés depuis les slugs (accents restaurés + cas particuliers).

const GROUPS = {
  'bons-plans-conso': ['bons-plans', 'promos', 'ventes-flash', 'soldes', 'codes-promo', 'cashback', 'livraison-gratuite', 'baisse-de-prix', 'restock', 'disponibilite', 'precommandes', 'occasions', 'encheres', 'echantillons-gratuits', 'deals-du-jour'],
  'shopping': ['high-tech', 'smartphones', 'composants-pc', 'gpu', 'consoles', 'sneakers', 'mode', 'beaute', 'electromenager', 'meubles', 'jouets', 'equipement-sportif'],
  'billetterie-sorties': ['billetterie', 'concerts', 'spectacles', 'festivals', 'cinema', 'theatre', 'expositions', 'musees', 'matchs', 'evenements-sportifs'],
  'voyages': ['voyages', 'vols', 'erreurs-de-prix', 'billets-train', 'hotels', 'campings', 'locations-vacances', 'croisieres', 'ferries', 'road-trip', 'visas', 'delais-passeport'],
  'meteo-risques': ['meteo', 'vigilance-meteo', 'orages', 'pluie-inondation', 'inondations', 'crues', 'neige', 'verglas', 'avalanches', 'canicule', 'grand-froid', 'vent-violent', 'tempetes', 'submersion', 'secheresse', 'feux-de-foret'],
  'environnement-nature': ['environnement', 'qualite-air', 'pollution', 'pollens', 'allergies', 'uv', 'seismes', 'volcans', 'marees', 'grandes-marees', 'astronomie', 'aurores-boreales', 'eclipses', 'etoiles-filantes'],
  'energie': ['energie', 'electricite', 'coupures-electricite', 'tension-reseau', 'gaz', 'prix-carburant', 'fioul', 'bois-pellets', 'eau', 'coupures-eau'],
  'transports': ['transports', 'trains', 'greves', 'trafic-routier', 'bouchons', 'autoroutes', 'fermetures-routes', 'cols-montagne', 'viabilite-hivernale', 'transports-en-commun', 'metro', 'aerien', 'retards-vols', 'covoiturage', 'bornes-recharge'],
  'tech-dev': ['tech', 'domaines', 'noms-de-domaine', 'certificats-ssl', 'uptime', 'pannes-services', 'status-cloud', 'github', 'releases', 'versions-logiciels', 'mises-a-jour', 'npm-packages', 'changements-api', 'fin-de-support', 'hackathons', 'frameworks', 'mises-a-jour-os', 'hardware'],
  'securite-cyber': ['securite', 'cybersecurite', 'cve', 'vulnerabilites', 'failles', 'fuites-de-donnees', 'phishing', 'arnaques', 'rappels-securite', 'alertes-fraude'],
  'administration': ['administration', 'impots', 'echeances-fiscales', 'declarations', 'aides', 'subventions', 'allocations', 'caf', 'retraite', 'permis-de-conduire', 'carte-grise', 'elections', 'journal-officiel', 'reglementation'],
  'pro-marches': ['marches-publics', 'appels-offres', 'appels-a-projets', 'financements', 'creation-entreprise', 'franchises', 'salons-pro', 'networking'],
  'emploi-formation': ['emploi', 'offres-emploi', 'concours', 'fonction-publique', 'stages', 'alternance', 'formations', 'certifications', 'examens', 'resultats-examens', 'parcoursup', 'bourses'],
  'finance': ['finance', 'bourse', 'actions', 'crypto', 'bitcoin', 'taux-interet', 'taux-immobilier', 'livret-a', 'inflation', 'devises', 'or-metaux', 'dividendes'],
  'sante': ['sante', 'medicaments', 'penuries-medicaments', 'rappels-produits', 'rappels-alimentaires', 'vaccins', 'epidemies', 'grippe', 'dons-du-sang', 'pharmacies-de-garde'],
  'immobilier': ['immobilier', 'annonces-immobilieres', 'location', 'achat-immobilier', 'encheres-immobilieres', 'logement-social', 'permis-de-construire', 'dpe', 'aides-travaux', 'demenagement'],
  'culture-medias': ['culture', 'livres', 'sorties-livres', 'bd', 'manga', 'musique', 'sorties-albums', 'vinyles', 'streaming', 'films', 'series', 'podcasts', 'jeux-de-societe', 'patrimoine'],
  'gaming': ['jeux-video', 'sorties-jeux', 'precommandes-jeux', 'dlc', 'patchs-jeux', 'e-sport', 'tournois', 'twitch', 'free-to-play', 'retrogaming'],
  'sport': ['sport', 'football', 'rugby', 'tennis', 'cyclisme', 'ski', 'randonnee', 'trail', 'natation', 'resultats-sportifs', 'transferts', 'inscriptions-courses'],
  'vie-locale': ['local', 'evenements-locaux', 'marches-locaux', 'brocantes', 'vide-greniers', 'travaux-voirie', 'coupures-circulation', 'collecte-dechets', 'dechetteries', 'piscines', 'bibliotheques', 'ecoles', 'cantines', 'mairie'],
  'alimentation': ['alimentation', 'restaurants', 'food-trucks', 'produits-locaux', 'vins', 'bieres', 'recoltes'],
  'agriculture-jardin': ['agriculture', 'meteo-agricole', 'gel-cultures', 'vendanges', 'jardinage', 'semis', 'champignons', 'chasse', 'peche', 'apiculture'],
  'auto-moto': ['automobile', 'rappels-vehicules', 'controle-technique', 'prix-occasion', 'nouveautes-auto', 'moto', 'zfe', 'vignette-critair', 'radars', 'permis-points'],
  'animaux': ['animaux', 'adoption-animaux', 'animaux-perdus', 'veterinaire', 'aquariophilie', 'ornithologie'],
  'espace-science': ['espace', 'lancements-spatiaux', 'iss', 'science', 'decouvertes', 'conferences-science'],
  'solidarite': ['solidarite', 'dons', 'benevolat', 'associations', 'petitions', 'collectes'],
  'autre': ['autre'],
};

// Cas particuliers (label exact).
const SPECIAL = {
  'zfe': "ZFE / Crit'Air",
  'dpe': 'DPE',
  'cve': 'CVE',
  'iss': 'ISS',
  'uv': 'Indice UV',
  'caf': 'CAF',
  'bd': 'BD',
  'dlc': 'DLC',
  'gpu': 'Cartes graphiques',
  'e-sport': 'E-sport',
  'npm-packages': 'Packages npm',
  'livret-a': 'Livret A',
  'mises-a-jour': 'Mises à jour',
  'mises-a-jour-os': 'Mises à jour OS',
  'appels-a-projets': 'Appels à projets',
  'vignette-critair': "Vignette Crit'Air",
  'status-cloud': 'Statut cloud',
  'certificats-ssl': 'Certificats SSL',
  'changements-api': "Changements d'API",
  'qualite-air': "Qualité de l'air",
};

// Restauration d'accents au niveau du mot.
const ACCENTS = {
  meteo: 'météo', electricite: 'électricité', energie: 'énergie', securite: 'sécurité',
  cybersecurite: 'cybersécurité', sante: 'santé', cinema: 'cinéma', theatre: 'théâtre',
  musees: 'musées', evenements: 'événements', delais: 'délais', echantillons: 'échantillons',
  precommandes: 'précommandes', encheres: 'enchères', secheresse: 'sécheresse', seismes: 'séismes',
  marees: 'marées', eclipses: 'éclipses', etoiles: 'étoiles', boreales: 'boréales', qualite: 'qualité',
  greves: 'grèves', aerien: 'aérien', viabilite: 'viabilité', vulnerabilites: 'vulnérabilités',
  donnees: 'données', impots: 'impôts', echeances: 'échéances', declarations: 'déclarations',
  elections: 'élections', reglementation: 'réglementation', marches: 'marchés', creation: 'création',
  resultats: 'résultats', interet: 'intérêt', metaux: 'métaux', medicaments: 'médicaments',
  penuries: 'pénuries', epidemies: 'épidémies', immobilieres: 'immobilières', demenagement: 'déménagement',
  series: 'séries', societe: 'société', video: 'vidéo', retrogaming: 'rétrogaming', randonnee: 'randonnée',
  dechets: 'déchets', dechetteries: 'déchetteries', bibliotheques: 'bibliothèques', ecoles: 'écoles',
  bieres: 'bières', recoltes: 'récoltes', peche: 'pêche', vehicules: 'véhicules', controle: 'contrôle',
  nouveautes: 'nouveautés', veterinaire: 'vétérinaire', decouvertes: 'découvertes', conferences: 'conférences',
  solidarite: 'solidarité', benevolat: 'bénévolat', petitions: 'pétitions', disponibilite: 'disponibilité',
  beaute: 'beauté', electromenager: 'électroménager', equipement: 'équipement', hotels: 'hôtels',
  croisieres: 'croisières', tempetes: 'tempêtes', foret: 'forêt', metro: 'métro',
};

function toLabel(slug) {
  if (SPECIAL[slug]) return SPECIAL[slug];
  var words = String(slug).split('-').map(function (t) { return ACCENTS[t] || t; }).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Construit la liste plate, en dédupliquant les slugs.
const CATEGORIES = [];
const seen = new Set();
Object.keys(GROUPS).forEach(function (group) {
  GROUPS[group].forEach(function (slug) {
    if (!seen.has(slug)) { seen.add(slug); CATEGORIES.push({ slug: slug, label: toLabel(slug), group: group }); }
  });
});

const VALID_SLUGS = CATEGORIES.map((c) => c.slug);
const MAX_CATEGORIES = 3;
const MAX_TAG_LEN = 30;

// Slug propre : minuscules, sans accents, tirets, max 30 caractères.
function slugifyTag(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LEN);
}

// Nettoie/valide une liste reçue : tags libres slugifiés, uniques, 1..3 éléments.
// Accepte des catégories hors liste pré-établie. Retourne { ok, categories, error }.
function sanitizeCategories(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'categories doit être un tableau' };
  }
  const cleaned = [];
  for (const raw of input) {
    const slug = slugifyTag(raw);
    if (slug && !cleaned.includes(slug)) cleaned.push(slug);
  }
  if (cleaned.length < 1) return { ok: false, error: 'au moins une catégorie est requise' };
  if (cleaned.length > MAX_CATEGORIES) {
    return { ok: false, error: `maximum ${MAX_CATEGORIES} catégories` };
  }
  return { ok: true, categories: cleaned };
}

module.exports = { CATEGORIES, VALID_SLUGS, MAX_CATEGORIES, MAX_TAG_LEN, slugifyTag, sanitizeCategories, toLabel };
