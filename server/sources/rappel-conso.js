// Source PARAMÉTRÉE (OpenAlert v2) : rappels de produits à RISQUE GRAVE
// (RappelConso), par CATÉGORIE au choix de l'abonné. Remplace la source
// broadcast historique (alimentaire uniquement) : les abonnés existants sont
// migrés vers {categorie:"alimentation"} — comportement préservé à l'identique.
//
// API : dataset Opendatasoft 'rappelconso-v2-gtin-trie' (data.economie.gouv.fr,
// public sans clé, bien la V2). Un SEUL appel par cycle couvre toutes les
// catégories souscrites (where categorie_produit IN (...)), puis regroupement
// côté serveur → 1 état par combinaison, comme la vigilance-factory.
//
// ANTI-SPAM STRICT : on ne retient que les fiches dont le risque/motif contient
// un motif GRAVE. La liste de mots-clés couvre TOUTES les catégories :
//   - alimentaire : microbiologique / toxique / corps étranger / allergène ;
//   - non alimentaire : blessure, brûlure, choc électrique, incendie,
//     étouffement, strangulation, arrêt respiratoire, intoxication, chimique.
// Actif si ≥ 1 fiche grave publiée dans les dernières 72h pour la catégorie.
// requires_confirmation = true. since = fiche la plus récente retenue.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DATASET = 'rappelconso-v2-gtin-trie';
const API_BASE = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const PORTAL_URL = 'https://rappel.conso.gouv.fr/';
const TIMEOUT_MS = 10_000;
const WINDOW_MS = 72 * 60 * 60 * 1000;

// Catégories exposées (value = valeur EXACTE normalisée du champ categorie_produit,
// constatée par group_by ; label = libellé FR propre). multiple:true.
const CATS = [
  { value: 'alimentation', label: 'Alimentation' },
  { value: 'bébés-enfants (hors alimentaire)', label: 'Bébés & enfants' },
  { value: 'maison-habitat', label: 'Maison & habitat' },
  { value: 'appareils électriques, outils', label: 'Appareils électriques & outils' },
  { value: 'vêtements, mode, epi', label: 'Vêtements & mode' },
  { value: 'hygiène-beauté', label: 'Hygiène & beauté' },
  { value: 'sports-loisirs', label: 'Sports & loisirs' },
  { value: 'automobiles et moyens de déplacement', label: 'Auto & mobilité' },
  { value: 'equipements de communication', label: 'Équipements de communication' },
  { value: 'autres', label: 'Autres produits' },
];

const paramsSchema = [
  {
    key: 'categorie',
    label: 'Catégorie de produit',
    type: 'enum',
    values: CATS,
    multiple: true,
    required: true,
    default: 'alimentation',
  },
];

// Motifs graves (normalisés, sans accent) → libellé affiché.
const GRAVE = [
  // Alimentaire / microbiologique / toxique.
  { kw: 'listeria', label: 'listéria' },
  { kw: 'salmonell', label: 'salmonelle' },
  { kw: 'escherichia', label: 'E. coli' },
  { kw: 'e. coli', label: 'E. coli' },
  { kw: 'e.coli', label: 'E. coli' },
  { kw: 'botuli', label: 'botulisme' },
  { kw: 'toxine', label: 'toxine' },
  { kw: 'corps etranger', label: 'corps étranger' },
  { kw: 'allergene', label: 'allergène non déclaré' },
  // Non alimentaire (blessures, feu, électricité, chimique…).
  { kw: 'blessure', label: 'risque de blessure' },
  { kw: 'brulure', label: 'brûlure' },
  { kw: 'choc electrique', label: 'choc électrique' },
  { kw: 'electrocu', label: 'électrocution' },
  { kw: 'incendie', label: 'incendie' },
  { kw: 'inflammati', label: 'inflammation' },
  { kw: 'etouffement', label: 'étouffement' },
  { kw: 'strangulation', label: 'strangulation' },
  { kw: 'arret respiratoire', label: 'arrêt respiratoire' },
  { kw: 'intoxication', label: 'intoxication' },
  { kw: 'chimique', label: 'risque chimique' },
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function graveLabels(row) {
  const hay = norm(row.risques_encourus) + ' ' + norm(row.motif_rappel);
  const found = [];
  for (const g of GRAVE) {
    if (hay.includes(g.kw) && found.indexOf(g.label) === -1) found.push(g.label);
  }
  return found;
}

function cleanLibelle(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Produit';
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Construit l'état d'UNE catégorie à partir de ses fiches graves.
function resultFor(params, isFood, grave) {
  if (grave.length === 0) {
    return { params, state: 'inactive', since: null, until: null, message: null, url: PORTAL_URL };
  }
  const mostRecent = grave.reduce((a, b) => (b.date && (!a.date || b.date > a.date) ? b : a), grave[0]);
  const since = mostRecent.date || new Date();
  const noun = isFood ? 'alimentaire' : 'produit';

  let message;
  let url;
  if (grave.length === 1) {
    const r = mostRecent.row;
    const marque = r.marque_produit && String(r.marque_produit).trim().toLowerCase() !== 'sans marque'
      ? ` – ${String(r.marque_produit).trim()}` : '';
    message = `⚠️ Rappel ${noun} : ${cleanLibelle(r.libelle)}${marque} (${mostRecent.labels[0]})`;
    url = r.lien_vers_la_fiche_rappel || PORTAL_URL;
  } else {
    const distinct = [];
    grave.forEach((g) => g.labels.forEach((l) => { if (distinct.indexOf(l) === -1) distinct.push(l); }));
    message = `⚠️ ${grave.length} rappels ${noun}s à risque grave (${distinct.slice(0, 3).join(', ')}) — vérifiez vos achats`;
    url = PORTAL_URL;
  }
  return { params, state: 'active', since, until: null, message, url };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  const wanted = combos.map((p) => String((p && p.categorie) || '')).filter(Boolean);
  const uniqueCats = Array.from(new Set(wanted));
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // Un seul appel : toutes les catégories souscrites, 72h, tri desc.
  const inList = uniqueCats.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(', ');
  const params = new URLSearchParams({
    limit: '100',
    order_by: 'date_publication desc',
    where: `categorie_produit in (${inList}) and date_publication >= "${since}"`,
    select: 'date_publication,categorie_produit,libelle,marque_produit,risques_encourus,motif_rappel,lien_vers_la_fiche_rappel',
  });
  const url = `${API_BASE}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API RappelConso (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API RappelConso échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue RappelConso : ${res.status} ${res.statusText}`);

  let payload;
  try { payload = await res.json(); }
  catch (err) { throw new Error(`Réponse RappelConso illisible (JSON invalide) : ${err.message}`); }
  const rows = Array.isArray(payload && payload.results) ? payload.results : [];

  // Regroupe les fiches graves par catégorie.
  const byCat = new Map();
  for (const r of rows) {
    const labels = graveLabels(r);
    if (!labels.length) continue;
    const cat = r.categorie_produit;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({ row: r, labels, date: parseDate(r.date_publication) });
  }

  // Un résultat par combinaison souscrite.
  return combos.map((p) => {
    const cat = String((p && p.categorie) || '');
    const grave = byCat.get(cat) || [];
    return resultFor(p, cat === 'alimentation', grave);
  });
}

module.exports = { id: 'rappel-conso', paramsSchema, checkWithParams };
