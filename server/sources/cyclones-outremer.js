// Source PARAMÉTRÉE (OpenAlert v2) — Vigilance / alerte CYCLONIQUE outre-mer, TERRITOIRE au choix.
// Active à partir de l'ORANGE (les niveaux vert/jaune et les phénomènes non cycloniques sont
// ignorés — anti-spam). 6 territoires : Guadeloupe, Martinique, Guyane, La Réunion, Mayotte,
// Îles du Nord (St-Martin/St-Barthélemy).
//
// ── CLÉ & ENDPOINT ───────────────────────────────────────────────────────────
//   Clé = METEOFRANCE_API_KEY (token DPVigilance, couvre métropole ET OM — pas de clé dédiée OM).
//   Envoyée en header `apikey`. Endpoint dans METEOFRANCE_VIGILANCE_OM_URL, ex. :
//     https://public-api.meteofrance.fr/public/DPVigilance/v1/vigilanceom/flux/dernier
//   Sans URL → no-op (tout inactif). Sans clé → l'appel échoue → inactive silencieux.
//
// ── FORMAT RÉEL DU FLUX (observé le 25/07/2026) ──────────────────────────────
//   La réponse n'est PAS du JSON direct : c'est un ZIP (~946 Ko, ~16 fichiers) mêlant PDF
//   (bulletins), TXT et 1 XML. Le JSON structuré est logé dans des fichiers .txt CDPV*_*.txt,
//   UN par territoire (parfois deux : couleurs + bulletin texte). Deux schémas coexistent :
//     • VIGILANCE (couleurs)   : { warning_type:"vigilance", update_time,
//         timelaps:{ domain_ids:[ { domain_id, max_color_id,
//           phenomenon_items:[ { phenomenon_id, phenomenon_max_color_id, timelaps_items:[…] } ] } ] } }
//       PAS de `periods`. Les domain_id sont SUFFIXÉS par zone : "VIGI972" (rollup), "VIGI972-01",
//       "VIGI972-58"… ; Îles du Nord = "VIGI978-977[-…]". → on matche par PRÉFIXE, jamais ===.
//     • BULLETIN DE SUIVI (texte) : { report_subtype:"Bulletin de suivi", domain_id,
//         text_bloc_items:[ { text_items:[ {title,text} ] } ] } — prose, AUCUNE couleur. Ignoré
//       pour la décision. (Observé : Réunion CDPV96 + Mayotte CDPV87 en DOUBLON de leur fichier
//       couleurs ; aucun territoire promis n'est « texte seul » dans l'échantillon.)
//   Fichiers ignorés : PDF (bulletins), WXFP01_*.txt (texte brut non-JSON), NXFR33_*.xml
//   (Saint-Pierre-et-Miquelon dep 975 — hors des 6 territoires promis).
//
// ── ÉCHELLE COULEUR & DÉCISION ───────────────────────────────────────────────
//   color_id / *_color_id sur l'échelle DPVigilance : 1=vert, 2=jaune, 3=orange, 4=rouge
//   (−1 = non applicable / pas de donnée). Le phénomène CYCLONE = phenomenon_id 10 (présent en
//   Océan Indien ET Antilles-Guyane). Niveau cyclonique du territoire = MAX des
//   phenomenon_max_color_id (phénomène 10) sur toutes ses zones. ALERTE si ≥ 3 (orange).
//   Exemple (échantillon 25/07) : Martinique VIGI972, phénomène 10 → color 1 (vert) → inactive.
//   Un passage orange (3) ou rouge (4) déclenche « 🌀 <territoire> : vigilance cyclonique … ».
//
// ── ROBUSTESSE ───────────────────────────────────────────────────────────────
//   ZIP corrompu / non-ZIP / fichier manquant / JSON illisible / territoire absent des fichiers
//   couleurs → inactive silencieux PAR territoire, jamais de fausse alerte. Un territoire présent
//   uniquement en bulletin texte est tracé (console.warn) pour arbitrage humain.
//
// ── ÉCARTÉS / TODO EXTENSION ─────────────────────────────────────────────────
//   Nouvelle-Calédonie & Polynésie française : NON couvertes par ce flux vigilanceom.
//   TODO (non implémenté) : endpoints JSON SÉPARÉS /ncaledonie/ et /polynesie/ (schéma distinct
//   à explorer) → extension candidate, ajouterait 2 territoires au paramsSchema.

const AdmZip = require('adm-zip');
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const OM_URL = (process.env.METEOFRANCE_VIGILANCE_OM_URL || '').trim();
const API_KEY = (process.env.METEOFRANCE_API_KEY || '').trim();
const PUBLIC_URL = 'https://vigilance.meteofrance.fr/fr';
const TIMEOUT_MS = 15_000;                // ZIP ~1 Mo
const MAX_BYTES = 5 * 1024 * 1024;        // garde-fou taille (échantillon ~946 Ko)
const PHENO_CYCLONE = 10;                 // identifiant du phénomène « cyclone » (spec vigilance OM)
const ALERT_MIN = 3;                      // seuil d'alerte = orange (3)
const COULEUR_LABEL = { 3: 'orange', 4: 'rouge' };

// Territoires couverts et leur code de domaine DE BASE (matché par préfixe).
const TERRITOIRES = [
  { value: 'guadeloupe', label: 'Guadeloupe', domain: 'VIGI971', url: `${PUBLIC_URL}/guadeloupe` },
  { value: 'martinique', label: 'Martinique', domain: 'VIGI972', url: `${PUBLIC_URL}/martinique` },
  { value: 'guyane', label: 'Guyane', domain: 'VIGI973', url: `${PUBLIC_URL}/guyane` },
  { value: 'la-reunion', label: 'La Réunion', domain: 'VIGI974', url: `${PUBLIC_URL}/la-reunion` },
  { value: 'mayotte', label: 'Mayotte', domain: 'VIGI976', url: `${PUBLIC_URL}/mayotte` },
  { value: 'iles-du-nord', label: 'Îles du Nord (St-Martin / St-Barthélemy)', domain: 'VIGI978', url: PUBLIC_URL },
];
const BY_VALUE = {};
TERRITOIRES.forEach((t) => { BY_VALUE[t.value] = t; });

const paramsSchema = [
  {
    key: 'territoire',
    label: 'Territoire',
    type: 'enum',
    values: TERRITOIRES.map((t) => ({ value: t.value, label: t.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Un domaine appartient au territoire si son domain_id est le code de base OU une de ses zones
// (préfixe "CODE-"). Ex. VIGI972 / VIGI972-01 ; Îles du Nord : VIGI978-977 / VIGI978-977-54.
function domainMatchesTerritory(domainId, code) {
  const s = String(domainId || '');
  return s === code || s.startsWith(code + '-');
}

// Niveau cyclonique MAX d'un territoire dans UN payload "vigilance" (couleurs) : max des
// phenomenon_max_color_id (phénomène 10) sur toutes les zones du territoire. Renvoie null si le
// territoire est absent du payload ; sinon la couleur max (0 si aucune donnée cyclone exploitable).
function cycloneColorForTerritory(payload, code) {
  const domains = payload && payload.timelaps && Array.isArray(payload.timelaps.domain_ids)
    ? payload.timelaps.domain_ids : [];
  let max = null;
  for (const d of domains) {
    if (!d || !domainMatchesTerritory(d.domain_id, code)) continue;
    if (max === null) max = 0;                 // territoire présent (même si pas de cyclone)
    const items = Array.isArray(d.phenomenon_items) ? d.phenomenon_items : [];
    for (const it of items) {
      if (Number(it.phenomenon_id) !== PHENO_CYCLONE) continue;
      const c = Number(it.phenomenon_max_color_id);
      if (Number.isFinite(c) && c > max) max = c;
    }
  }
  return max;
}

// Décompression + tri des fichiers du ZIP. Renvoie { vigilance:[payloads couleurs],
// textCodes:Set<domain_id vus en bulletin texte seul> }.
function parseFlux(buffer) {
  const zip = new AdmZip(buffer);
  const vigilance = [];
  const textCodes = new Set();
  for (const e of zip.getEntries()) {
    if (!e.entryName.endsWith('.txt')) continue;   // PDF/XML ignorés
    let j;
    try { j = JSON.parse(e.getData().toString('utf8')); } catch (x) { continue; } // ex. WXFP01 = texte brut
    if (j && j.timelaps && Array.isArray(j.timelaps.domain_ids)) {
      vigilance.push(j);
    } else if (j && Array.isArray(j.text_bloc_items)) {
      j.text_bloc_items.forEach((b) => { if (b && b.domain_id) textCodes.add(String(b.domain_id)); });
    }
  }
  return { vigilance, textCodes };
}

async function fetchOM() {
  const headers = { Accept: 'application/zip' };
  if (API_KEY) headers.apikey = API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(OM_URL, { headers, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Vigilance OM (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel Vigilance OM échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Vigilance OM : ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`ZIP Vigilance OM trop volumineux (${buf.length} o)`);
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('Réponse Vigilance OM non-ZIP');
  return buf;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  // No-op tant que l'endpoint OM n'est pas branché (voir en-tête).
  if (!OM_URL) return combos.map(inactive);

  let flux;
  try {
    flux = parseFlux(await fetchOM());
  } catch (err) {
    console.warn(`[cyclones-outremer] ${err.message} → inactive.`);
    return combos.map(inactive);
  }

  return combos.map((p) => {
    const terr = BY_VALUE[String((p && p.territoire) || '')];
    if (!terr) return inactive(p);

    let color = null;
    try {
      for (const payload of flux.vigilance) {
        const c = cycloneColorForTerritory(payload, terr.domain);
        if (c !== null) color = (color === null) ? c : Math.max(color, c);
      }
    } catch (err) {
      console.warn(`[cyclones-outremer] ${terr.value} : ${err.message} → inactive.`);
      return inactive(p);
    }

    if (color === null) {
      // Territoire absent des fichiers COULEURS. S'il n'existe qu'en bulletin texte → à arbitrer.
      const textOnly = Array.from(flux.textCodes).some((cd) => domainMatchesTerritory(cd, terr.domain));
      if (textOnly) console.warn(`[cyclones-outremer] ${terr.value} : bulletin texte seul (sans couleurs) → inactive, à arbitrer.`);
      return inactive(p);
    }
    return decide(p, terr, color);
  });
}

// Couleur cyclonique → état. < orange (vert/jaune/pas de cyclone) → inactive silencieux ;
// orange(3)/rouge(4) → active avec message attribué.
function decide(params, terr, color) {
  if (color === null || color < ALERT_MIN) return inactive(params);
  const couleur = COULEUR_LABEL[color] || (color > 4 ? 'rouge' : 'orange');
  return {
    params,
    state: 'active',
    since: new Date(),
    until: null,
    message: `🌀 ${terr.label} : vigilance cyclonique ${couleur} — suivez les consignes officielles.`,
    url: terr.url,
  };
}

module.exports = {
  id: 'cyclones-outremer',
  paramsSchema,
  checkWithParams,
  _parseFlux: parseFlux,
  _cycloneColorForTerritory: cycloneColorForTerritory,
  _domainMatchesTerritory: domainMatchesTerritory,
  _decide: decide,
  _TERRITOIRES: TERRITOIRES,
};
