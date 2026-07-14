// Source interne : rappels de produits alimentaires à RISQUE GRAVE (RappelConso).
//
// API : dataset Opendatasoft 'rappelconso-v2-gtin-trie' (data.economie.gouv.fr,
// public sans clé — même famille qu'Ecogaz/carburants). ⚠️ bien la V2 (la V1
// 'rappelconso0' est dépréciée).
//
// STRUCTURE RÉELLE CONSTATÉE (juillet 2026) : champs plats dont
//   categorie_produit (normalisé : 'alimentation', 'maison-habitat'…),
//   sous_categorie_produit, libelle (nom produit, minuscule), marque_produit,
//   risques_encourus (texte libre, parfois séparé par '|', ex. 'listeria
//   monocytogenes …'), motif_rappel (texte libre), lien_vers_la_fiche_rappel,
//   date_publication (ISO). Fraîcheur : versement CONTINU (fiches du jour même
//   observées), pas seulement hebdomadaire.
//
// ANTI-SPAM STRICT : on ne retient que les rappels ALIMENTAIRES dont le risque/
// motif contient un motif GRAVE (microbiologique / toxique / corps étranger /
// allergène non déclaré). Les blessures, surpressions, etc. sont ignorées.
// Actif si ≥ 1 fiche grave publiée dans les dernières 72h. requires_confirmation
// = true (filtre par mots-clés → confirmation sur 2 cycles). since = date de la
// fiche la plus récente retenue (une nouvelle fiche ≥24h plus tard re-notifie).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DATASET = 'rappelconso-v2-gtin-trie';
const API_BASE = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const PORTAL_URL = 'https://rappel.conso.gouv.fr/';
const TIMEOUT_MS = 10_000;
const WINDOW_MS = 72 * 60 * 60 * 1000;

// Motifs graves : { motif (normalisé, sans accent) → libellé affiché }.
const GRAVE = [
  { kw: 'listeria', label: 'listéria' },
  { kw: 'salmonell', label: 'salmonelle' },
  { kw: 'escherichia', label: 'E. coli' },
  { kw: 'e. coli', label: 'E. coli' },
  { kw: 'e.coli', label: 'E. coli' },
  { kw: 'botuli', label: 'botulisme' },
  { kw: 'toxine', label: 'toxine' },
  { kw: 'corps etranger', label: 'corps étranger' },
  { kw: 'allergene', label: 'allergène non déclaré' },
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Libellés graves trouvés dans une fiche (risques + motif), sans doublon.
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
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Produit alimentaire';
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function check() {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const params = new URLSearchParams({
    limit: '20',
    order_by: 'date_publication desc',
    where: `categorie_produit="alimentation" and date_publication >= "${since}"`,
    select: 'date_publication,libelle,marque_produit,risques_encourus,motif_rappel,lien_vers_la_fiche_rappel',
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
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse RappelConso illisible (JSON invalide) : ${err.message}`);
  }
  const rows = Array.isArray(payload && payload.results) ? payload.results : [];

  // Fiches alimentaires à risque grave (le tri date desc vient de l'API).
  const grave = [];
  for (const r of rows) {
    const labels = graveLabels(r);
    if (labels.length) grave.push({ row: r, labels, date: parseDate(r.date_publication) });
  }

  if (grave.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: PORTAL_URL };
  }

  // Épisode : since = date de la fiche la plus récente retenue.
  const mostRecent = grave.reduce((a, b) => (b.date && (!a.date || b.date > a.date) ? b : a), grave[0]);
  const since2 = mostRecent.date || new Date();

  let message;
  let url2;
  if (grave.length === 1) {
    const r = mostRecent.row;
    const marque = r.marque_produit && String(r.marque_produit).trim().toLowerCase() !== 'sans marque'
      ? ` – ${String(r.marque_produit).trim()}` : '';
    message = `⚠️ Rappel alimentaire : ${cleanLibelle(r.libelle)}${marque} (${mostRecent.labels[0]})`;
    url2 = r.lien_vers_la_fiche_rappel || PORTAL_URL;
  } else {
    const distinct = [];
    grave.forEach((g) => g.labels.forEach((l) => { if (distinct.indexOf(l) === -1) distinct.push(l); }));
    message = `⚠️ ${grave.length} rappels alimentaires à risque grave (${distinct.slice(0, 3).join(', ')}) — vérifiez vos placards`;
    url2 = PORTAL_URL;
  }

  return { state: 'active', since: since2, until: null, message, url: url2 };
}

module.exports = { id: 'rappel-conso', check };
