// Source PARAMÉTRÉE (OpenAlert v2) : fête nationale du/des PAYS au choix de l'abonné.
// Calculée (calendar + params), ZÉRO API. Ton sobre et purement informatif — sujets
// identitaires : aucune interprétation politique, on annonce la date, c'est tout.
//
// DATES VÉRIFIÉES une à une (jamais de mémoire : voir rapport de vague). Deux familles
// dans le MÊME enum : pays d'origine des diasporas + pays de résidence d'expatriés.
// ANTI-DOUBLON : les fêtes nationales du Québec (24/06), Belgique (21/07) et Suisse
// (01/08) sont couvertes par feries-quebec/-belgique/-suisse → EXCLUES ici. Le 14/07
// est dans jours-feries. Royaume-Uni ÉCARTÉ (pas de fête nationale fixe unique).
// L'Irlande (17/03) coexiste volontairement avec l'entrée festive Saint-Patrick de
// fetes-gourmandes (publics différents : diaspora/expat vs culture festive).
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }. Fenêtre : J-2 → jour J.

const DAY_MS = 24 * 60 * 60 * 1000;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const PUBLIC_URL = 'https://fr.wikipedia.org/wiki/F%C3%AAte_nationale';
const ANNOUNCE_DAYS = 2;

// value, label, m (0-based), d, fete (nom officiel court). Dates VÉRIFIÉES.
// Champ 'special' pour les rares dates mobiles (Koningsdag).
const COUNTRIES = [
  // — Pays d'origine des diasporas francophones —
  { value: 'algerie', label: 'Algérie', m: 6, d: 5, fete: "fête de l'Indépendance" },       // 5 juillet 1962
  { value: 'maroc', label: 'Maroc', m: 6, d: 30, fete: 'fête du Trône' },                    // 30 juillet
  { value: 'tunisie', label: 'Tunisie', m: 2, d: 20, fete: "fête de l'Indépendance" },       // 20 mars 1956
  { value: 'senegal', label: 'Sénégal', m: 3, d: 4, fete: "fête de l'Indépendance" },        // 4 avril 1960
  { value: 'cote-ivoire', label: "Côte d'Ivoire", m: 7, d: 7, fete: "fête de l'Indépendance" }, // 7 août 1960
  { value: 'mali', label: 'Mali', m: 8, d: 22, fete: "fête de l'Indépendance" },             // 22 septembre 1960
  { value: 'cameroun', label: 'Cameroun', m: 4, d: 20, fete: "fête de l'Unité" },            // 20 mai
  { value: 'rdc', label: 'RD Congo', m: 5, d: 30, fete: "fête de l'Indépendance" },          // 30 juin 1960
  { value: 'madagascar', label: 'Madagascar', m: 5, d: 26, fete: "fête de l'Indépendance" }, // 26 juin 1960
  { value: 'haiti', label: 'Haïti', m: 0, d: 1, fete: "jour de l'Indépendance" },            // 1er janvier 1804
  { value: 'liban', label: 'Liban', m: 10, d: 22, fete: "fête de l'Indépendance" },          // 22 novembre 1943
  { value: 'portugal', label: 'Portugal', m: 5, d: 10, fete: 'Dia de Portugal' },            // 10 juin
  { value: 'comores', label: 'Comores', m: 6, d: 6, fete: "fête de l'Indépendance" },        // 6 juillet 1975
  { value: 'congo-brazzaville', label: 'Congo-Brazzaville', m: 7, d: 15, fete: "fête de l'Indépendance" }, // 15 août 1960
  // — Pays de résidence d'expatriés français —
  { value: 'usa', label: 'États-Unis', m: 6, d: 4, fete: 'Independence Day' },               // 4 juillet
  { value: 'espagne', label: 'Espagne', m: 9, d: 12, fete: 'Fiesta Nacional' },              // 12 octobre
  { value: 'allemagne', label: 'Allemagne', m: 9, d: 3, fete: "journée de l'Unité allemande" }, // 3 octobre
  { value: 'italie', label: 'Italie', m: 5, d: 2, fete: 'Festa della Repubblica' },          // 2 juin
  { value: 'luxembourg', label: 'Luxembourg', m: 5, d: 23, fete: 'fête nationale' },         // 23 juin
  { value: 'monaco', label: 'Monaco', m: 10, d: 19, fete: 'fête du Prince' },                // 19 novembre
  { value: 'grece', label: 'Grèce', m: 2, d: 25, fete: "fête de l'Indépendance" },           // 25 mars (principale)
  { value: 'pays-bas', label: 'Pays-Bas', m: 3, d: 27, fete: 'Koningsdag', special: 'koningsdag' }, // 27 avril (26 si dimanche)
  { value: 'irlande', label: 'Irlande', m: 2, d: 17, fete: 'Saint-Patrick' },                // 17 mars
];

const BY_VALUE = {};
COUNTRIES.forEach((c) => { BY_VALUE[c.value] = c; });

const paramsSchema = [
  {
    key: 'pays',
    label: 'Pays',
    type: 'enum',
    values: COUNTRIES.map((c) => ({ value: c.value, label: c.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

// Date de la fête pour un pays et une année (gère Koningsdag : 27 avril, ou 26 si le
// 27 tombe un dimanche — règle officielle néerlandaise, entièrement calculable).
function feteDate(country, year) {
  if (country.special === 'koningsdag') {
    let d = new Date(year, 3, 27);
    if (d.getDay() === 0) d = new Date(year, 3, 26);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(year, country.m, country.d);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function whenLabel(occ, now) {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate());
  const diff = Math.round((d1.getTime() - d0.getTime()) / DAY_MS);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return cap(JOURS[occ.getDay()]);
}
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = new Date();
  return combos.map((params) => {
    const c = BY_VALUE[String((params && params.pays) || '')];
    if (!c) return inactive(params);

    // Occurrence courante ; si déjà passée (au-delà du jour J), viser l'an prochain.
    let occ = feteDate(c, now.getFullYear());
    let activeEnd = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate(), 23, 59);
    if (now.getTime() > activeEnd.getTime()) {
      occ = feteDate(c, now.getFullYear() + 1);
      activeEnd = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate(), 23, 59);
    }
    const windowStart = new Date(occ.getTime() - ANNOUNCE_DAYS * DAY_MS);
    if (now.getTime() < windowStart.getTime() || now.getTime() > activeEnd.getTime()) return inactive(params);

    // Format sans préposition (évite tout écueil grammatical d'article/genre) : sobre.
    return {
      params,
      state: 'active',
      since: windowStart,
      until: activeEnd,
      message: `🎉 ${whenLabel(occ, now)} : ${c.label} — fête nationale (${c.fete}).`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'fetes-nationales', paramsSchema, checkWithParams };
