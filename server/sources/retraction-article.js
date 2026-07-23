// Source BROADCAST (OpenAlert v2) : nouvelle RÉTRACTATION d'article scientifique.
//
// Données : base Retraction Watch, exposée proprement via l'API Crossref (SANS clé) :
//   GET https://api.crossref.org/works?filter=update-type:retraction&sort=deposited&order=desc
//   → message.items[] { DOI, title[], deposited:{ date-time } }.
// (select=updated est INVALIDE sur cette route → on utilise `deposited` pour la fraîcheur.)
//
// ── CHOIX BROADCAST (et non paramétré par mot-clé) ───────────────────────────
// La v2 ne permet pas de souscrire un champ optionnel VIDE (validateParams refuse des params
// vides ; le front exige une valeur). Un « mot-clé optionnel, sinon général » ne s'exprime donc
// pas dans un seul champ paramétré. On implémente ici le FLUX GÉNÉRAL (broadcast) — la variante
// ciblée par domaine (source paramétrée dédiée, ou filtre facultatif) reste une évolution possible.
//
// ── DÉDOUBLONNAGE + ANTI-RÉTROACTIF ──────────────────────────────────────────
// Dédoublonnage par DOI. Au 1er passage, on mémorise les DOI courants SANS alerter
// (anti-rétroactif). Seul un DOI JAMAIS vu déclenche. since = date de dépôt Crossref (les
// rétractations sont généralement espacées → nouvel épisode côté poller). Cache mémoire.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://api.crossref.org/works?filter=update-type:retraction&sort=deposited&order=desc&rows=20&select=DOI,title,deposited';
const PUBLIC_URL = 'https://retractionwatch.com/';
const TIMEOUT_MS = 12_000;
const MAX_TITLE = 160;
// Courtoisie Crossref « polite pool » : un User-Agent identifiant est recommandé.
const UA = 'LaBonneAlerte/1.0 (https://labonnealerte.fr; mailto:contact@labonnealerte.fr)';

// null = pas encore amorcé (anti-rétroactif) ; sinon Set des DOI déjà vus.
let seen = null;

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

function cleanTitle(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  // Crossref préfixe souvent « RETRACTED: » / « Retraction Notice: » → on l'enlève (redondant).
  s = s.replace(/^(RETRACTED:?\s*|Retraction(\s+Notice)?:?\s*)/i, '').trim();
  if (s.length > MAX_TITLE) s = s.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

async function fetchRetractions() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout Crossref');
    throw new Error('Appel Crossref échoué : ' + err.message);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const items = body && body.message && Array.isArray(body.message.items) ? body.message.items : [];
  return items.map((it) => {
    const dt = it.deposited && it.deposited['date-time'] ? new Date(it.deposited['date-time']) : null;
    return {
      doi: String(it.DOI || '').trim(),
      titre: cleanTitle(Array.isArray(it.title) ? it.title[0] : it.title),
      date: dt && !Number.isNaN(dt.getTime()) ? dt : new Date(),
    };
  }).filter((r) => r.doi);
}

async function check() {
  let items;
  try { items = await fetchRetractions(); }
  catch (err) { console.warn(`[retraction-article] ${err.message} → inactive.`); return inactive(); }
  if (!items.length) return inactive();

  // 1er passage : amorçage, aucune alerte (anti-rétroactif).
  if (seen === null) {
    seen = new Set(items.map((r) => r.doi));
    return inactive();
  }

  const nouveaux = items.filter((r) => !seen.has(r.doi));
  items.forEach((r) => seen.add(r.doi));
  if (!nouveaux.length) return inactive();

  nouveaux.sort((a, b) => b.date - a.date);
  const r = nouveaux[0];
  return {
    state: 'active',
    since: r.date,
    until: null,
    message: `🚩 Nouvelle rétractation d'article scientifique : « ${r.titre || r.doi} » (base Retraction Watch, via Crossref).`,
    url: 'https://doi.org/' + r.doi,
  };
}

module.exports = { id: 'retraction-article', check, _test: { peek: () => seen, poke: (k) => seen && seen.delete(k) } };
