// Factory « indicateur INSEE » : une série de la Banque de Données Macro-économiques
// (BDM) via le service web SDMX HISTORIQUE, SANS clé ni OAuth (constaté 07/2026) :
//   GET https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/{idbank}?lastNObservations=N
// (le nouveau portail portail-api.insee.fr, lui, exige un jeton — on ne l'utilise PAS).
//
// La réponse est un XML SDMX 2.1 « StructureSpecific » : les attributs de série et
// d'observation sont PLATS (key="value"), donc parsés au regex sans dépendance XML.
//   <Series IDBANK LAST_UPDATE TITLE_FR UNIT_MEASURE DECIMALS ...>
//     <Obs TIME_PERIOD="2026-Q2" OBS_VALUE="148.37" OBS_QUAL="DEF" .../> ...
//
// Modèle d'ALERTE (broadcast, notification immédiate) : la source devient active
// à CHAQUE nouvelle publication et le reste `freshDays` jours, puis retombe. Le
// champ `since` = date de diffusion (LAST_UPDATE) → une nouvelle publication fait
// avancer `since` de plus de 24 h et re-notifie via la logique d'épisode du poller.
// Anti-bruit : on n'active QUE si la dernière observation est DÉFINITIVE
// (OBS_QUAL="DEF") — les estimations provisoires (fin de mois pour l'IPC) sont
// ignorées, une seule alerte par publication.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = (idbank, n) =>
  `https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/${idbank}?lastNObservations=${n}`;
const TIMEOUT_MS = 10_000;
const N_OBS = 14; // couvre le glissement annuel MENSUEL (n-1 = index 12) ET trimestriel
                  // (index 4). 14 laisse une marge. Plus d'observations = plus de data,
                  // aucune logique changée (les séries déjà-en-% n'utilisent pas obs[step]).
const DAY_MS = 24 * 60 * 60 * 1000;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// "2026-Q2" → "T2 2026" ; "2026-06" → "juin 2026".
function formatPeriode(tp) {
  const s = String(tp || '');
  let m = s.match(/^(\d{4})-Q([1-4])$/);
  if (m) return `T${m[2]} ${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MOIS[Number(m[2]) - 1] || ('mois ' + m[2])} ${m[1]}`;
  return s;
}

// Nombre en français : point décimal → virgule, séparateur retiré. 148.37 → "148,37".
function formatNombre(v, decimals) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const d = typeof decimals === 'number' ? decimals : undefined;
  return (d != null ? n.toFixed(d) : String(n)).replace('.', ',');
}

// Extrait tous les attributs key="value" d'une balise.
function attrs(tag) {
  const out = {};
  const re = /([A-Za-z_]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

// Parse le XML SDMX : { series:{...attrs}, obs:[{...attrs}, ...] } trié du plus
// récent au plus ancien (par TIME_PERIOD décroissant).
function parseSdmx(xml) {
  const sMatch = xml.match(/<Series\b[^>]*>/);
  const series = sMatch ? attrs(sMatch[0]) : {};
  const obs = [];
  const re = /<Obs\b[^>]*\/?>/g;
  let m;
  while ((m = re.exec(xml))) obs.push(attrs(m[0]));
  obs.sort((a, b) => String(b.TIME_PERIOD).localeCompare(String(a.TIME_PERIOD)));
  return { series, obs };
}

/**
 * @param {{ id, idbank, url, emoji, freshDays?, message:(ctx)=>string }} cfg
 *   message(ctx) reçoit { latest, prev, yoy, series, periodeLabel, valueLabel, formatNombre }
 *   où latest/prev sont des observations {TIME_PERIOD, OBS_VALUE,...}, yoy = glissement
 *   annuel calculé (%) ou null, periodeLabel = "T2 2026", valueLabel = "148,37".
 */
function createInseeSource(cfg) {
  const { id, idbank, url, freshDays = 4 } = cfg;

  async function check() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchFn(API(idbank, N_OBS), {
        headers: { Accept: 'application/xml' }, signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Timeout INSEE BDM (${idbank})`);
      throw new Error(`Appel INSEE BDM échoué (${idbank}) : ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Réponse HTTP inattendue INSEE (${idbank}) : ${res.status}`);

    const xml = await res.text();
    const { series, obs } = parseSdmx(xml);
    if (!obs.length) return { state: 'inactive', since: null, until: null, message: null, url };

    const latest = obs[0];
    // Anti-bruit : ignorer les publications provisoires (OBS_QUAL différent de DEF).
    if (latest.OBS_QUAL && latest.OBS_QUAL !== 'DEF') {
      return { state: 'inactive', since: null, until: null, message: null, url };
    }

    const lastUpdate = series.LAST_UPDATE ? new Date(series.LAST_UPDATE) : null;
    if (!lastUpdate || Number.isNaN(lastUpdate.getTime())) {
      return { state: 'inactive', since: null, until: null, message: null, url };
    }
    // Fenêtre d'activité : `freshDays` jours après la diffusion.
    if (Date.now() - lastUpdate.getTime() >= freshDays * DAY_MS) {
      return { state: 'inactive', since: null, until: null, message: null, url };
    }

    // Glissement annuel : même période l'an dernier (trimestriel = 4 obs, mensuel = 12).
    const step = String(latest.TIME_PERIOD).includes('-Q') ? 4 : 12;
    const prev = obs[step] || null;
    let yoy = null;
    if (prev) {
      const v0 = Number(latest.OBS_VALUE);
      const v1 = Number(prev.OBS_VALUE);
      if (!Number.isNaN(v0) && !Number.isNaN(v1) && v1 !== 0) yoy = ((v0 - v1) / v1) * 100;
    }

    const decimals = series.DECIMALS != null ? Number(series.DECIMALS) : undefined;
    const ctx = {
      latest, prev, yoy, series,
      periodeLabel: formatPeriode(latest.TIME_PERIOD),
      valueLabel: formatNombre(latest.OBS_VALUE, decimals),
      formatNombre,
    };

    return {
      state: 'active',
      since: lastUpdate,
      until: new Date(lastUpdate.getTime() + freshDays * DAY_MS),
      message: cfg.message(ctx),
      url,
    };
  }

  return { id, check };
}

module.exports = { createInseeSource, formatPeriode, formatNombre, parseSdmx };
