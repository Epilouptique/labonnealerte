// Source BROADCAST (v1) : ARROSAGE — CANAL DE GAP. Carte THÉMATIQUE pré-remplie par-dessus le
// moteur PanneauPocket. URL en dur (page de l'ASA du Canal de Gap) ; l'abonné n'a rien à saisir.
// Alerte uniquement sur les panneaux liés à l'EAU D'IRRIGATION (arrosage, tours d'eau,
// restrictions, coupures…), les autres panneaux de l'ASA sont ignorés.
//
// Réutilise lib/panneaupocket-parser.js (fetch + parsing) et le même pattern anti-rétroactif
// que sources/panneaupocket.js.
//
// ── FILTRE THÉMATIQUE ────────────────────────────────────────────────────────
//   On mémorise le hash de TOUS les panneaux (thématiques ou non) mais on n'ALERTE que sur les
//   panneaux actuellement thématiques. Conséquence voulue : un panneau hors-thème qui est
//   MODIFIÉ pour devenir thématique déclenche proprement (hash changé + devenu thématique).
//
// ── DÉTECTION (anti-rétroactif) ──────────────────────────────────────────────
//   1er cycle = amorçage silencieux (on mémorise tout). Ensuite, parmi les panneaux thématiques :
//   id jamais vu → « Nouveau panneau » ; id connu + hash ≠ → « Panneau mis à jour » (inclut le
//   passage « annulé »). Échec réseau/parsing → inactive silencieux, jamais de faux positif.

const { fetchPanneaux } = require('./lib/panneaupocket-parser');

const VILLE_URL = 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000';
const DETAILS_URL = 'https://www.canaldegap.fr';
const TTL_MS = 2 * 60 * 60 * 1000;   // 2h (info périssable, cohérent avec panneaupocket)
const RETRY_MS = 60 * 60 * 1000;     // réessai 1h après un échec

// Normalisation pour le filtre : minuscules, sans accents, apostrophes → espace.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mots-clés (déjà normalisés) : arrosage, tour(s) d'eau, restriction, autorisation, remise en
// eau, coupure, irrigation, ressource en eau. Match par sous-chaîne sur titre + texte.
const KEYWORDS = ['arrosage', 'tour d eau', 'tours d eau', 'restriction', 'autorisation', 'remise en eau', 'coupure', 'irrigation', 'ressource en eau'];

function isThematic(item) {
  const hay = normalize(`${item.title} ${item.text}`);
  return KEYWORDS.some((k) => hay.includes(k));
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: VILLE_URL };
}

// Message d'alerte (mêmes règles que panneaupocket + détails ASA + attribution PanneauPocket).
function buildMessage(events) {
  const link = (id) => `${VILLE_URL}?panneau=${id}`;
  const tag = (e) => (e.cancelled ? `« ${e.title} » (annulé)` : `« ${e.title} »`);
  const suffix = `Détails : ${DETAILS_URL} (via PanneauPocket)`;

  if (events.length === 1) {
    const e = events[0];
    const verbe = e.kind === 'new' ? 'Nouveau panneau' : 'Panneau mis à jour';
    return `💧 ${verbe} — ASA du Canal de Gap : ${tag(e)}. ${link(e.id)}. ${suffix}`;
  }
  const nNew = events.filter((e) => e.kind === 'new').length;
  const nUpd = events.length - nNew;
  const parts = [];
  if (nNew) parts.push(`${nNew} nouveau${nNew > 1 ? 'x' : ''}`);
  if (nUpd) parts.push(`${nUpd} mis à jour`);
  const titres = events.slice(0, 3).map(tag).join(', ') + (events.length > 3 ? '…' : '');
  // Plusieurs panneaux → lien vers la PAGE VILLE nue (sans ?panneau) pour tout voir.
  return `💧 ${events.length} panneaux arrosage — ASA du Canal de Gap (${parts.join(', ')}) : ${titres}. ${VILLE_URL}. ${suffix}`;
}

// État global (broadcast) : { refs: Map<id, hash> | null, at, ttl, result }.
let state = { refs: null, at: 0, ttl: 0, result: inactive() };

async function check() {
  const now = Date.now();
  if (state.refs !== null && now - state.at < state.ttl) return state.result;

  try {
    const { items } = await fetchPanneaux(VILLE_URL);
    const newRefs = new Map(items.map((it) => [it.id, it.hash]));

    let result;
    if (state.refs === null) {
      result = inactive(); // amorçage silencieux : on mémorise tout SANS alerter
    } else {
      const events = [];
      for (const it of items) {
        if (!isThematic(it)) continue; // hors-thème : mémorisé mais jamais d'alerte
        if (!state.refs.has(it.id)) events.push({ ...it, kind: 'new' });
        else if (state.refs.get(it.id) !== it.hash) events.push({ ...it, kind: 'update' });
      }
      result = events.length
        ? { state: 'active', since: new Date(), until: null, message: buildMessage(events), url: VILLE_URL }
        : inactive();
    }
    state = { refs: newRefs, at: now, ttl: TTL_MS, result };
    return result;
  } catch (err) {
    // Réseau / parsing → inactive silencieux, réessai rapproché, référence conservée.
    console.warn(`[arrosage-canal-gap] ${err.message} → inactive.`);
    const result = inactive();
    state = { refs: state.refs, at: now, ttl: RETRY_MS, result };
    return result;
  }
}

module.exports = { id: 'arrosage-canal-gap', check, _isThematic: isThematic, _buildMessage: buildMessage };
