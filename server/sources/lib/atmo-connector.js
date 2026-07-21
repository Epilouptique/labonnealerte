// Connecteur PARTAGÉ Atmo France — sert qualite-air.js ET pollens.js (même source de
// données, même agrégation commune→département). Zéro clé.
//
// Source : GeoServer WFS d'Atmo France (data.atmo-france.org), les MÊMES couches
// nationales que les jeux data.gouv « Indice ATMO quotidien par commune » et « Indice
// pollen » (constaté 2026-07-21). Sortie CSV, une ligne par COMMUNE (code INSEE) :
//   • Air    : couche ind:ind_atmo_2021 — champ code_qual (indice 1..6).
//   • Pollen : couche ind_pol:ind_pol   — champs code_<taxon> (1..6) par taxon + code_qual.
// Échelle commune aux deux : 1 bon … 4 mauvais … 6 extrêmement mauvais.
//
// AGRÉGATION commune→département = « PIRE CAS de la zone » : le département prend l'indice
// le plus mauvais parmi ses communes couvertes. Département dérivé du code INSEE commune
// (2 chiffres métropole ; 2A/2B Corse ; 97x DROM), aligné sur server/geo.js.
//
// Échéance : le WFS renvoie plusieurs échéances (J, J+1, J+2). On retient l'échéance
// la PLUS PROCHE ≥ aujourd'hui (typiquement le jour même, couverture maximale) ; à défaut
// (données un peu anciennes, cas des pollens publiés en fin de semaine), la plus récente.
//
// Cache mutualisé (TTL 3h) : la donnée est quotidienne, inutile de re-télécharger à chaque
// cycle. Un SEUL appel réseau par type et par fenêtre de cache, quel que soit le nombre
// d'abonnés. Échec réseau → throw (l'appelant dégrade en inactive silencieux).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE = 'https://data.atmo-france.org/geoserver';
const TIMEOUT_MS = 20_000; // le CSV national fait ~5-8 Mo
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

// Taxons polliniques (ordre indifférent) : clé de colonne WFS → libellé lisible.
const TAXONS = [
  { key: 'code_ambr', nom: 'ambroisie' },
  { key: 'code_arm', nom: 'armoise' },
  { key: 'code_aul', nom: 'aulne' },
  { key: 'code_boul', nom: 'bouleau' },
  { key: 'code_gram', nom: 'graminées' },
  { key: 'code_oliv', nom: 'olivier' },
];

const SOURCES = {
  air: {
    ws: 'ind',
    typeName: 'ind_atmo_2021',
    props: 'code_zone,code_qual,date_ech',
  },
  pollens: {
    ws: 'ind_pol',
    typeName: 'ind_pol:ind_pol',
    props: 'code_zone,date_ech,code_qual,' + TAXONS.map((t) => t.key).join(','),
  },
};

// code INSEE commune → code département (2 car. métropole, 2A/2B Corse, 97x DROM).
function deptOfInsee(insee) {
  const s = String(insee == null ? '' : insee).trim();
  if (/^2[AB]/i.test(s)) return s.slice(0, 2).toUpperCase();
  if (/^97/.test(s)) return s.slice(0, 3);
  return s.slice(0, 2);
}

// Parseur CSV minimal : on ne demande QUE des colonnes sans virgule ni guillemet
// (propertyName exclut the_geom et les libellés) → split simple sûr. Index par NOM
// d'en-tête (robuste à l'ordre / à un éventuel FID en tête).
function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { idx: {}, rows: [] };
  const header = lines[0].split(',');
  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });
  return { idx, rows: lines.slice(1).map((l) => l.split(',')) };
}

// Choisit l'échéance de référence parmi celles présentes : la plus proche ≥ aujourd'hui,
// sinon la plus récente disponible.
function pickEcheance(dates, todayIso) {
  const uniq = [...new Set(dates.filter(Boolean))].sort();
  if (!uniq.length) return null;
  const future = uniq.filter((d) => d >= todayIso);
  return future.length ? future[0] : uniq[uniq.length - 1];
}

async function fetchCsv(cfg) {
  const url = `${BASE}/${cfg.ws}/ows?service=WFS&version=2.0.0&request=GetFeature`
    + `&typeNames=${encodeURIComponent(cfg.typeName)}&outputFormat=csv`
    + `&propertyName=${encodeURIComponent(cfg.props)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'text/csv' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout WFS Atmo France');
    throw new Error('Appel WFS Atmo France échoué : ' + err.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error('Réponse HTTP inattendue Atmo France : ' + res.status);
  return parseCsv(await res.text());
}

// Agrège l'AIR par département : dept → indice max (1..6) sur l'échéance de référence.
function aggregateAir(parsed, todayIso) {
  const { idx, rows } = parsed;
  if (idx.code_qual == null || idx.code_zone == null) throw new Error('colonnes air absentes');
  const target = pickEcheance(rows.map((r) => r[idx.date_ech]), todayIso);
  const byDept = {};
  for (const r of rows) {
    if (r[idx.date_ech] !== target) continue;
    const dep = deptOfInsee(r[idx.code_zone]);
    const q = parseInt(r[idx.code_qual], 10);
    if (!Number.isFinite(q)) continue;
    if (byDept[dep] == null || q > byDept[dep]) byDept[dep] = q;
  }
  return { echeance: target, byDept };
}

// Agrège les POLLENS par département : dept → { level: indice max (1..6), taxon: libellé
// du taxon responsable du max } sur l'échéance de référence.
function aggregatePollens(parsed, todayIso) {
  const { idx, rows } = parsed;
  if (idx.code_zone == null) throw new Error('colonnes pollens absentes');
  const target = pickEcheance(rows.map((r) => r[idx.date_ech]), todayIso);
  const byDept = {};
  for (const r of rows) {
    if (r[idx.date_ech] !== target) continue;
    const dep = deptOfInsee(r[idx.code_zone]);
    let level = 0; let taxon = null;
    for (const t of TAXONS) {
      const v = parseInt(r[idx[t.key]], 10);
      if (Number.isFinite(v) && v > level) { level = v; taxon = t.nom; }
    }
    if (byDept[dep] == null || level > byDept[dep].level) byDept[dep] = { level, taxon };
  }
  return { echeance: target, byDept };
}

// Cache par type : { at, data }.
const cache = { air: null, pollens: null };

// Renvoie l'agrégat départemental { echeance, byDept } pour 'air' ou 'pollens', avec cache.
async function getByDept(kind) {
  const cfg = SOURCES[kind];
  if (!cfg) throw new Error('type Atmo inconnu : ' + kind);
  const entry = cache[kind];
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.data;
  const parsed = await fetchCsv(cfg);
  const todayIso = new Date().toISOString().slice(0, 10);
  const data = kind === 'air' ? aggregateAir(parsed, todayIso) : aggregatePollens(parsed, todayIso);
  cache[kind] = { at: Date.now(), data };
  return data;
}

module.exports = { getByDept, deptOfInsee, TAXONS };
