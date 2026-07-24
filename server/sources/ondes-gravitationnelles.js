// Source BROADCAST (OpenAlert v2) : détection d'ONDE GRAVITATIONNELLE (fusion d'objets compacts)
// par le réseau LIGO / Virgo / KAGRA, via GraceDB (SANS clé).
//
// API : https://gracedb.ligo.org/api/superevents/?query=category:+Production+label:+SIGNIF_LOCKED
//   → { numRows, superevents:[ { superevent_id, created, far, labels:[…], … } ] }.
//
// ── FILTRES (rare + fiable) ──────────────────────────────────────────────────
//   • category = Production : exclut les événements de TEST (Mock Data Challenge, préfixes MS/TS).
//   • SIGNIF_LOCKED : événements SIGNIFICATIFS (on ignore les low-significance, trop fréquents).
//   • ADVOK (« Advocate OK ») : confirmé par l'équipe rapid-response humaine ; on n'alerte QUE
//     sur des événements confirmés → haute précision, quitte à un léger délai (revue humaine).
//
// ── RÉTRACTATIONS (mécanisme réel, testé) ────────────────────────────────────
// Un événement retiré reçoit le label ADVNO (« Advocate NO »). Si un événement qu'on a DÉJÀ
// signalé reçoit ensuite ADVNO, on émet un MESSAGE DE CORRECTION (une fois) : l'utilisateur n'est
// jamais laissé avec une alerte non démentie. Un événement déjà ADVNO qu'on n'a jamais signalé
// est simplement ignoré (jamais confirmé → jamais alerté).
//
// ── ANTI-RÉTROACTIF ──────────────────────────────────────────────────────────
// Au 1er passage, on mémorise les événements confirmés courants SANS alerter. Dédoublonnage par
// superevent_id. Cache mémoire (réinit sûre au redémarrage).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://gracedb.ligo.org/api/superevents/?query=category:+Production+label:+SIGNIF_LOCKED&count=20';
const FICHE = (id) => `https://gracedb.ligo.org/superevents/${id}/view/`;
const PUBLIC_URL = 'https://gracedb.ligo.org/superevents/public/O4/';
const TIMEOUT_MS = 15_000;

let primed = false;          // anti-rétroactif : amorçage au 1er cycle
const seenConfirmed = new Set(); // superevent_id confirmés déjà pris en compte (dédoublonnage)
const alerted = new Set();       // superevent_id effectivement signalés (pour les corrections)
const corrected = new Set();     // superevent_id dont la rétractation a déjà été annoncée

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }
function hasLabel(s, name) { return Array.isArray(s.labels) && s.labels.includes(name); }
function createdDate(s) { const d = s.created ? new Date(String(s.created).replace(' UTC', 'Z').replace(' ', 'T')) : null; return d && !Number.isNaN(d.getTime()) ? d : new Date(); }

async function fetchSuperevents() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout GraceDB');
    throw new Error('Appel GraceDB échoué : ' + err.message);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  return Array.isArray(body.superevents) ? body.superevents : [];
}

async function check(injected) {
  // injected : liste de superevents fournie pour les TESTS ; en production, appel réel sans argument.
  let list;
  if (Array.isArray(injected)) { list = injected; }
  else {
    try { list = await fetchSuperevents(); }
    catch (err) { console.warn(`[ondes-gravitationnelles] ${err.message} → inactive.`); return inactive(); }
  }

  const confirmed = list.filter((s) => hasLabel(s, 'ADVOK') && !hasLabel(s, 'ADVNO'));
  const retractedNow = list.filter((s) => hasLabel(s, 'ADVNO'));

  // 1er passage : amorçage de la référence, aucune alerte (anti-rétroactif).
  if (!primed) {
    primed = true;
    confirmed.forEach((s) => seenConfirmed.add(s.superevent_id));
    return inactive();
  }

  // 1) PRIORITÉ aux corrections : un événement DÉJÀ signalé qui vient d'être rétracté (ADVNO).
  for (const s of retractedNow) {
    const id = s.superevent_id;
    if (alerted.has(id) && !corrected.has(id)) {
      corrected.add(id);
      return {
        state: 'active',
        since: new Date(),
        until: null,
        message: `⚠️ Correction : l'événement d'onde gravitationnelle ${id}, précédemment signalé, a été RÉTRACTÉ après analyse (ce n'était pas un signal astrophysique).`,
        url: FICHE(id),
      };
    }
  }

  // 2) Nouvelles détections confirmées.
  const nouveaux = confirmed.filter((s) => !seenConfirmed.has(s.superevent_id));
  confirmed.forEach((s) => seenConfirmed.add(s.superevent_id));
  if (!nouveaux.length) return inactive();

  nouveaux.sort((a, b) => createdDate(b) - createdDate(a));
  const s = nouveaux[0];
  alerted.add(s.superevent_id);
  return {
    state: 'active',
    since: createdDate(s),
    until: null,
    message: `🌌 Onde gravitationnelle détectée (${s.superevent_id}) : probable fusion d'objets compacts (trous noirs ou étoiles à neutrons), confirmée par LIGO/Virgo/KAGRA.`,
    url: FICHE(s.superevent_id),
  };
}

// ── PERSISTANCE opt-in (cf. poller.js) — 3 Sets globaux, CAP GLISSANT FIFO ────
// Cap 1000 ids par Set : au-delà, on ne garde que les 1000 plus récents (ordre d'insertion).
// MODE DE DÉFAILLANCE ASSUMÉ : si un superevent_id sorti du cap réapparaissait dans le flux
// GraceDB (re-publication amont — extrêmement improbable, les ids sont définitifs), il serait
// vu comme « nouveau » → UNE alerte en trop, JAMAIS un silence. Risque faible, assumé.
const REF_CAP = 1000;
const REF_SOFT_BYTES = 64 * 1024;
let refSnapshotJson = null;

function trimSet(set) {
  if (set.size <= REF_CAP) return;
  const keep = [...set].slice(-REF_CAP);
  set.clear();
  keep.forEach((v) => set.add(v));
}
function serializeRef() {
  return { seenConfirmed: [...seenConfirmed], alerted: [...alerted], corrected: [...corrected] };
}

// Hydrate les 3 Sets AVANT le check (data null/invalide → amorçage classique).
function loadRef(_params, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const fill = (set, arr) => { set.clear(); if (Array.isArray(arr)) arr.forEach((v) => set.add(v)); };
  fill(seenConfirmed, data.seenConfirmed);
  fill(alerted, data.alerted);
  fill(corrected, data.corrected);
  primed = true; // on possède une référence → plus d'amorçage
  refSnapshotJson = JSON.stringify(serializeRef());
}

// Renvoie la référence sérialisable si elle a changé, sinon undefined. Cap appliqué AVANT.
function dumpRef() {
  if (!primed) return undefined; // rien à persister avant l'amorçage
  trimSet(seenConfirmed); trimSet(alerted); trimSet(corrected);
  const obj = serializeRef();
  const json = JSON.stringify(obj);
  if (Buffer.byteLength(json, 'utf8') > REF_SOFT_BYTES) {
    console.warn('[ondes-gravitationnelles] ref > 64 Ko, non persistée.');
    return undefined;
  }
  if (json === refSnapshotJson) return undefined; // inchangé
  refSnapshotJson = json;
  return obj;
}

module.exports = { id: 'ondes-gravitationnelles', check, loadRef, dumpRef,
  _test: { seenConfirmed, alerted, corrected } };
