// Source PARAMÉTRÉE (OpenAlert v2) : veille juridique — nouveau texte au Journal Officiel
// (loi/décret/arrêté) correspondant à un MOT-CLÉ suivi. Réutilise l'open data Légifrance
// (rediffusion cohérente avec la Licence Ouverte : titre, nature, date, lien officiel).
//
// API Légifrance via PISTE (PRODUCTION), OAuth2 client_credentials (legifrance-auth.js).
// Sans identifiants → no-op silencieux.
//
// ── STRATÉGIE DE QUOTA : UN SEUL APPEL GLOBAL + FILTRAGE LOCAL ────────────────
// On ne fait PAS un appel par mot-clé. Une fois par cycle, on récupère le LOT du jour du
// Journal Officiel (fonds JORF, daté) — coût quasi indépendant du nombre d'abonnés — puis on
// FILTRE localement le lot selon le mot-clé de chaque combo :
//   1) POST .../consult/lastNJo { "nbElement": 2 }  → dernières éditions du JO (id JORFCONT…)
//   2) POST .../consult/jorfCont { "id": "JORFCONT…" } → textes de l'édition (CID JORFTEXT…, titre, nature, datePubli, nor)
// Structure de réponse exacte non testable ici (clé côté Railway) → extracteur DÉFENSIF récursif
// (repère les nœuds portant un id JORFTEXT/JORFCONT), robuste au détail du schéma.
//
// ── ANTI-RÉTROACTIF (spécificité du modèle « appel global ») ──────────────────
// Le filtrage se fait APRÈS l'appel global, donc l'anti-rétroactif est PAR COMBO : au 1er passage
// sur un mot-clé, on mémorise les CID des textes du lot courant qui matchent SANS alerter (ils
// étaient déjà publiés avant la souscription). Seuls des textes au CID JAMAIS vu déclenchent.
// Dédoublonnage par CID (identifiant stable de contenu). Cache mémoire → réinit sûre.
//
// ⚠️ PIÈGE CGU : un 403 malgré un token valide = CGU de l'API non acceptées pour l'ENVIRONNEMENT
// (Production) sur le portail PISTE. On loge distinctement ce cas pour Robot 2.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getToken, isConfigured } = require('../legifrance-auth');

const BASE = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const PUBLIC_URL = 'https://www.legifrance.gouv.fr/jorf/jo';
const TIMEOUT_MS = 12_000;
const GLOBAL_TTL_MS = 12 * 60 * 60 * 1000; // lot du jour rafraîchi ~2×/jour
const NB_JO = 2; // dernières éditions du JO à balayer

const paramsSchema = [
  {
    key: 'motcle',
    label: 'Mot-clé juridique',
    type: 'string',
    placeholder: 'éolien, gendarmerie, apprentissage…',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Un mot-clé recherché dans les nouveaux textes du Journal Officiel (lois, décrets, arrêtés). Alerte à la publication d\'un texte correspondant.',
  },
];

// Cache global du lot du jour, et cache par mot-clé (seen:Set<cid>).
let globalCache = { at: 0, textes: null };
const comboCache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// dateParution du JO est un timestamp epoch EN MILLISECONDES (structure réelle observée
// le 23/07/2026), pas une chaîne ISO. On formate en JJ/MM/AAAA. Robuste aussi à une éventuelle
// chaîne ISO (fallback : renvoyée telle quelle). Renvoie '' si non exploitable.
function formatDateParution(v) {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : (/^\d{10,}$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
  if (Number.isFinite(n)) {
    const ms = n < 1e12 ? n * 1000 : n; // tolère un epoch en secondes
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  }
  return String(v).trim(); // déjà une chaîne lisible (ISO ou autre)
}

async function apiPost(path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(BASE + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (res.status === 403) throw new Error('HTTP 403 — CGU de l\'API Légifrance non acceptées pour la PRODUCTION (portail PISTE) ?');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Extracteur DÉFENSIF : parcourt récursivement un JSON et collecte les nœuds portant un id
// commençant par `prefix` (JORFCONT ou JORFTEXT), avec les champs voisins utiles.
function scanByIdPrefix(node, prefix, out, seen) {
  if (node == null || typeof node !== 'object') return;
  if (seen.has(node)) return; seen.add(node);
  if (Array.isArray(node)) { for (const x of node) scanByIdPrefix(x, prefix, out, seen); return; }
  const id = node.id || node.cid;
  if (typeof id === 'string' && id.startsWith(prefix)) out.push(node);
  for (const k of Object.keys(node)) scanByIdPrefix(node[k], prefix, out, seen);
}

// Récupère le lot du jour (dernières éditions JO → leurs textes), dédupliqué par CID.
async function fetchLotDuJour(token) {
  const jo = await apiPost('/consult/lastNJo', { nbElement: NB_JO }, token);
  const conts = []; scanByIdPrefix(jo, 'JORFCONT', conts, new Set());
  const contIds = [...new Set(conts.map((c) => c.id))].slice(0, NB_JO);
  // dateParution (epoch ms) porté par le CONTAINER, pas par chaque texte → on l'indexe par CID de JO
  // pour la propager aux textes (affichage). Anti-rétroactif/dédoublonnage restent par CID de texte.
  const contDate = new Map(conts.map((c) => [c.id, c.dateParution]));

  const byCid = new Map();
  for (const cid of contIds) {
    let cont;
    try { cont = await apiPost('/consult/jorfCont', { id: cid }, token); }
    catch (err) { console.warn(`[veille-legifrance] jorfCont ${cid} : ${err.message}`); continue; }
    const nodes = []; scanByIdPrefix(cont, 'JORFTEXT', nodes, new Set());
    // dateParution éventuellement re-fournie dans la réponse jorfCont ; sinon celle de lastNJo.
    const contsInResp = []; scanByIdPrefix(cont, 'JORFCONT', contsInResp, new Set());
    const dateRaw = (contsInResp.find((c) => c.id === cid) || {}).dateParution ?? contDate.get(cid);
    for (const t of nodes) {
      const c = t.id || t.cid;
      if (!byCid.has(c)) {
        // Le texte peut porter sa propre date (datePubli) ; sinon on retombe sur la dateParution du JO.
        const texteDate = t.datePubli || t.date;
        byCid.set(c, {
          cid: c,
          titre: String(t.titre || t.title || '').trim(),
          nature: String(t.nature || '').trim(),
          date: formatDateParution(texteDate != null && texteDate !== '' ? texteDate : dateRaw),
          nor: String(t.nor || '').trim(),
        });
      }
    }
  }
  return [...byCid.values()];
}

// Un texte matche un mot-clé si son titre (ou nature) contient le mot-clé (accent-insensible).
function matches(texte, motcleN) {
  return norm(texte.titre).includes(motcleN) || norm(texte.nature).includes(motcleN);
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  if (!isConfigured()) return combos.map((params) => Object.assign({ params }, inactive()));

  let token;
  try { token = await getToken(); }
  catch (err) { console.warn(`[veille-legifrance] auth échouée (${err.message}) → inactive.`); return combos.map((params) => Object.assign({ params }, inactive())); }

  // UN SEUL appel global (mutualisé, mis en cache) pour TOUS les combos.
  const now = Date.now();
  if (!globalCache.textes || now - globalCache.at >= GLOBAL_TTL_MS) {
    try { globalCache = { at: now, textes: await fetchLotDuJour(token) }; }
    catch (err) { console.warn(`[veille-legifrance] lot du jour indisponible (${err.message}) → inactive.`); return combos.map((params) => Object.assign({ params }, inactive())); }
  }
  const textes = globalCache.textes || [];

  // Filtrage LOCAL par mot-clé + anti-rétroactif par combo (mutualisé par mot-clé).
  const results = new Map();
  return combos.map((params) => {
    const motcle = String((params && params.motcle) || '').trim();
    const key = norm(motcle);
    if (!motcle) return Object.assign({ params }, inactive());
    if (results.has(key)) return Object.assign({ params }, results.get(key));

    const found = textes.filter((t) => matches(t, key));
    const cids = found.map((t) => t.cid);
    const entry = comboCache.get(key);
    let r;
    if (!entry) {
      comboCache.set(key, { seen: new Set(cids), at: now }); // 1er passage : référence, pas d'alerte
      r = inactive();
    } else {
      const nouvelles = found.filter((t) => !entry.seen.has(t.cid));
      cids.forEach((c) => entry.seen.add(c));
      entry.at = now;
      if (!nouvelles.length) r = inactive();
      else {
        const t = nouvelles[0];
        const d = t.date ? ` (${t.date})` : '';
        r = {
          state: 'active', since: new Date(), until: null,
          message: `⚖️ Nouveau texte au Journal Officiel pour « ${motcle} » : ${t.titre || t.nature || 'texte'}${d}. Source : Légifrance.`,
          url: t.cid ? `https://www.legifrance.gouv.fr/jorf/id/${t.cid}` : PUBLIC_URL,
        };
      }
    }
    results.set(key, r);
    return Object.assign({ params }, r);
  });
}

module.exports = { id: 'veille-legifrance', paramsSchema, checkWithParams };
// Exposé pour tests locaux (traversée récursive, matching, dates). Sans effet en prod.
module.exports._internals = { scanByIdPrefix, matches, norm, formatDateParution };
