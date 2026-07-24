// Lib partagée — MOTEUR DE VEILLE PanneauPocket (factory). Factorise le pattern anti-rétroactif
// commun à toutes les cartes bâties sur PanneauPocket : panneaupocket (paramétrée par URL),
// ma-collectivite (paramétrée par ville → URL), arrosage-canal-gap (broadcast, filtre thématique).
//
// ── DÉTECTION (anti-rétroactif, jamais de faux positif) ──────────────────────
//   Référence par URL : Map<panneauId → hash(titre + texte + état annulé)>.
//     • 1er cycle          = AMORÇAGE : on mémorise tous les couples id→hash, AUCUNE alerte.
//     • id jamais vu       → « Nouveau panneau ».
//     • id connu, hash ≠   → « Panneau mis à jour » (texte modifié ou passage « annulé »).
//     • id connu, hash =   → silence (re-sauvegarde cosmétique).
//     • id disparu         → retrait silencieux de la référence.
//   Échec réseau/parsing → inactive silencieux. Cache mémoire (TTL 2h), perdu au redéploiement
//   (dette connue : un panneau apparu pendant un arrêt peut être manqué, jamais inventé).
//
//   Prédicat `alertable(item)` optionnel : on MÉMORISE toujours TOUS les panneaux (id→hash),
//   mais on n'ALERTE que sur ceux qui le satisfont (filtre thématique). Conséquence voulue :
//   un panneau hors-critère MODIFIÉ pour le devenir déclenche proprement (hash changé + devenu
//   alertable). Défaut : tout panneau est alertable.

const { validPanneauUrl, fetchPanneaux } = require('./panneaupocket-parser');

const TTL_MS = 2 * 60 * 60 * 1000;   // 2h (info périssable — ex. arrosage publié pour le soir même)
const RETRY_MS = 60 * 60 * 1000;     // réessai 1h après un échec
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const always = () => true;

// Compare la référence précédente aux panneaux courants → { events, newRefs }.
// newRefs = TOUS les panneaux (mémorisation complète). events = uniquement les alertables
// nouveaux/modifiés (vide au 1er cycle, prevRefs == null).
function diffPanneaux(prevRefs, items, alertable) {
  const newRefs = new Map(items.map((it) => [it.id, it.hash]));
  const events = [];
  if (prevRefs) {
    for (const it of items) {
      if (!alertable(it)) continue; // hors-critère : mémorisé mais jamais d'alerte
      if (!prevRefs.has(it.id)) events.push({ ...it, kind: 'new' });
      else if (prevRefs.get(it.id) !== it.hash) events.push({ ...it, kind: 'update' });
    }
  }
  return { events, newRefs };
}

// Message d'alerte PAR DÉFAUT (📣 attribution « via PanneauPocket », nom de collectivité).
// Partagé par panneaupocket et ma-collectivite. arrosage-canal-gap fournit sa propre variante.
function defaultBuildMessage(events, city, urlObj) {
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

// ── FABRIQUE PARAMÉTRÉE (v2) : une URL /ville/ par combinaison souscrite ─────
// opts : { id, paramsSchema, buildMessage=defaultBuildMessage, alertable=always }.
// Re-valide chaque URL via validPanneauUrl AVANT tout fetch (défense en profondeur).
function createParamSource(opts) {
  const { id, paramsSchema } = opts;
  const buildMessage = opts.buildMessage || defaultBuildMessage;
  const alertable = opts.alertable || always;
  const cache = new Map(); // url → { refs, at, ttl, result }

  const inactive = (url) => ({ state: 'inactive', since: null, until: null, message: null, url });

  async function checkWithParams(paramsList) {
    const combos = Array.isArray(paramsList) ? paramsList : [];
    const now = Date.now();
    let fetches = 0;
    const out = [];

    for (const params of combos) {
      const urlObj = validPanneauUrl(String((params && params.url) || ''));
      if (!urlObj) { out.push(Object.assign({ params }, inactive('https://labonnealerte.fr'))); continue; }
      const url = urlObj.href;

      const entry = cache.get(url);
      if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
      if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(url))); continue; }
      fetches += 1;

      let result;
      try {
        const { city, items } = await fetchPanneaux(url);
        const { events, newRefs } = diffPanneaux(entry && entry.refs, items, alertable);
        result = (entry && entry.refs && events.length)
          ? { state: 'active', since: new Date(), until: null, message: buildMessage(events, city, urlObj), url }
          : inactive(url);
        cache.set(url, { refs: newRefs, at: now, ttl: TTL_MS, result });
      } catch (err) {
        // Réseau / parsing / SSRF bloqué / 4xx-5xx → inactive silencieux, réessai rapproché.
        // On conserve la référence existante (ne rien perdre, ne rien inventer).
        console.warn(`[${id}] ${url} : ${err.message} → inactive.`);
        result = inactive(url);
        cache.set(url, { refs: entry ? entry.refs : null, at: now, ttl: RETRY_MS, result });
      }
      out.push(Object.assign({ params }, result));
    }
    return out;
  }

  return { id, paramsSchema, checkWithParams, _buildMessage: buildMessage };
}

// ── FABRIQUE BROADCAST (v1) : une URL /ville/ fixe, état global unique ───────
// opts : { id, url, buildMessage, alertable=always }.
function createBroadcastSource(opts) {
  const { id, url } = opts;
  const buildMessage = opts.buildMessage || defaultBuildMessage;
  const alertable = opts.alertable || always;
  const urlObj = validPanneauUrl(url); // URL fixe de confiance, validée une fois

  const inactive = () => ({ state: 'inactive', since: null, until: null, message: null, url });
  let state = { refs: null, at: 0, ttl: 0, result: inactive() };

  async function check() {
    const now = Date.now();
    if (state.refs !== null && now - state.at < state.ttl) return state.result;

    try {
      if (!urlObj) throw new Error('URL PanneauPocket invalide');
      const { city, items } = await fetchPanneaux(urlObj.href);
      const { events, newRefs } = diffPanneaux(state.refs, items, alertable);
      const result = (state.refs !== null && events.length)
        ? { state: 'active', since: new Date(), until: null, message: buildMessage(events, city, urlObj), url }
        : inactive();
      state = { refs: newRefs, at: now, ttl: TTL_MS, result };
      return result;
    } catch (err) {
      console.warn(`[${id}] ${err.message} → inactive.`);
      const result = inactive();
      state = { refs: state.refs, at: now, ttl: RETRY_MS, result };
      return result;
    }
  }

  return { id, check };
}

module.exports = { createParamSource, createBroadcastSource, defaultBuildMessage, diffPanneaux, TTL_MS, RETRY_MS };
