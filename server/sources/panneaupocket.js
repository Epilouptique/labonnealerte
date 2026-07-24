// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE PANNEAUPOCKET. L'abonné saisit l'URL de la page
// d'une collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…) ; la source
// alerte dès qu'un panneau NOUVEAU est publié ou qu'un panneau existant est MODIFIÉ
// (y compris s'il passe « annulé »). Cas d'usage pilote : ASA du Canal de Gap (autorisations
// d'arrosage, tours d'eau, coupures).
//
// Récupération + parsing factorisés dans lib/panneaupocket-parser.js (partagés avec les cartes
// thématiques pré-remplies, ex. arrosage-canal-gap). Ici : validation d'entrée, détection
// anti-rétroactif et rendu du message.
//
// ── DÉTECTION (anti-rétroactif, jamais de faux positif) ──────────────────────
//   Référence mémorisée par URL : Map<panneauId → hash(titre + texte + état annulé)>.
//     • 1er cycle          = AMORÇAGE : on mémorise tous les couples id→hash, AUCUNE alerte.
//     • id jamais vu       → « Nouveau panneau ».
//     • id connu, hash ≠   → « Panneau mis à jour » (texte modifié ou passage « annulé »).
//     • id connu, hash =   → silence (re-sauvegarde cosmétique).
//     • id disparu         → retrait silencieux de la référence, pas d'alerte.
//   Échec réseau/parsing → inactive silencieux (jamais de fausse alerte). Cache mémoire (TTL),
//   perdu au redéploiement (dette connue : un panneau apparu pendant un arrêt peut être manqué,
//   jamais inventé).

const { validPanneauUrl, parsePanneaux, fetchPanneaux } = require('./lib/panneaupocket-parser');

const TTL_MS = 2 * 60 * 60 * 1000;    // 2h (info périssable — ex. arrosage publié l'après-midi pour le soir ; poll ~12×/jour, reste poli)
const RETRY_MS = 60 * 60 * 1000;      // réessai 1h après un échec
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'url',
    label: 'URL de la page PanneauPocket',
    type: 'string',
    placeholder: 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000',
    pattern: '^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Copiez l\'adresse de la page de votre collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Vous êtes prévenu à chaque nouveau panneau ou mise à jour (coupure d\'eau, arrosage, travaux…).',
  },
];

function inactive(url) {
  return { state: 'inactive', since: null, until: null, message: null, url };
}

// Construit le message d'alerte agrégé (attribution « via PanneauPocket » visible).
function buildMessage(events, city, urlObj) {
  const base = `${urlObj.origin}${urlObj.pathname}`;
  const link = (id) => `${base}?panneau=${id}`;
  const who = city ? ` — ${city}` : '';
  const tag = (e) => (e.cancelled ? `« ${e.title} » (annulé)` : `« ${e.title} »`);

  if (events.length === 1) {
    const e = events[0];
    const verbe = e.kind === 'new' ? 'Nouveau panneau' : 'Panneau mis à jour';
    return `📣 ${verbe} PanneauPocket${who} : ${tag(e)}. ${link(e.id)} (via PanneauPocket)`;
  }
  const nNew = events.filter((e) => e.kind === 'new').length;
  const nUpd = events.length - nNew;
  const parts = [];
  if (nNew) parts.push(`${nNew} nouveau${nNew > 1 ? 'x' : ''}`);
  if (nUpd) parts.push(`${nUpd} mis à jour`);
  const titres = events.slice(0, 3).map(tag).join(', ') + (events.length > 3 ? '…' : '');
  // Plusieurs panneaux → lien vers la PAGE VILLE nue (sans ?panneau) pour tout voir.
  return `📣 ${events.length} panneaux PanneauPocket${who} (${parts.join(', ')}) : ${titres}. ${base} (via PanneauPocket)`;
}

// Cache par URL : { refs: Map<id, hash>, at, ttl, result }.
const cache = new Map();

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const raw = String((params && params.url) || '');
    const urlObj = validPanneauUrl(raw);
    if (!urlObj) { out.push(Object.assign({ params }, inactive('https://labonnealerte.fr'))); continue; }
    const url = urlObj.href;

    const entry = cache.get(url);
    if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(url))); continue; }
    fetches += 1;

    let result;
    try {
      const { city, items } = await fetchPanneaux(url);
      const newRefs = new Map(items.map((it) => [it.id, it.hash]));

      if (!entry || !entry.refs) {
        // 1er cycle : amorçage silencieux, on mémorise tout SANS alerter.
        result = inactive(url);
      } else {
        const events = [];
        for (const it of items) {
          if (!entry.refs.has(it.id)) events.push({ ...it, kind: 'new' });
          else if (entry.refs.get(it.id) !== it.hash) events.push({ ...it, kind: 'update' });
        }
        // ids disparus : simplement absents de newRefs → retrait silencieux.
        result = events.length
          ? { state: 'active', since: new Date(), until: null, message: buildMessage(events, city, urlObj), url }
          : inactive(url);
      }
      cache.set(url, { refs: newRefs, at: now, ttl: TTL_MS, result });
    } catch (err) {
      // Réseau / parsing / SSRF bloqué / 4xx-5xx → inactive silencieux, réessai rapproché.
      // On conserve la référence existante (ne rien perdre, ne rien inventer).
      console.warn(`[panneaupocket] ${url} : ${err.message} → inactive.`);
      result = inactive(url);
      cache.set(url, { refs: entry ? entry.refs : null, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'panneaupocket', paramsSchema, checkWithParams, _parsePanneaux: parsePanneaux, _validPanneauUrl: validPanneauUrl, _buildMessage: buildMessage };
