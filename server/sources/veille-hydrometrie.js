// Source PARAMÉTRÉE (OpenAlert v2), NICHE : VEILLE DE NIVEAU DE RIVIÈRE (hydrométrie). L'abonné
// surveille une station et un SEUIL de hauteur d'eau ; la source alerte au FRANCHISSEMENT du
// seuil (montée au-dessus ou retour en dessous). Utile aux riverains, pêcheurs, kayakistes.
//
// ⚠️ DISTINCTE de vigicrues-departement (vigilance officielle crues par département) : ici c'est
// une station PRÉCISE + un seuil PERSONNEL choisi par l'utilisateur, pas la vigilance nationale.
//
// API publique officielle, SANS clé — testée en réel le 21/07/2026 (6452 stations) :
//   GET https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=<CODE>
//       &grandeur_hydro=H&size=1&sort=desc → data[0].resultat_obs = hauteur en MILLIMÈTRES.
//   (référentiel des codes station : …/hydrometrie/referentiel/stations)
//
// ── PARAMÈTRE COMBINÉ « CODE SEUIL » ─────────────────────────────────────────
// L'UI n'affiche qu'UN champ de paramètre → on combine « code de station » et « seuil (mm) »
// dans une seule chaîne « CODE SEUIL » (ex. « O972001001 1500 »), parsée côté serveur — même
// approche que rappel-personnalise (« JJ/MM Libellé »). Seuil exprimé en MILLIMÈTRES (unité API).
//
// Référence au 1er cycle sans alerte : on mémorise le CÔTÉ du seuil (au-dessus/en dessous) ;
// seul un franchissement APRÈS la souscription déclenche.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr';
const PUBLIC_URL = 'https://www.vigicrues.gouv.fr/';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h (le niveau bouge vite)
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
// « CODE SEUIL » : code station alphanumérique (6-12) + espace + seuil (mm).
const PARAM_RE = /^([A-Za-z0-9]{6,12})\s+(\d{1,7})(?:[.,](\d+))?$/;

const paramsSchema = [
  {
    key: 'surveillance',
    label: 'Station et seuil (code + mm)',
    type: 'string',
    placeholder: 'O972001001 1500',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Code de la station Hub\'Eau puis le seuil de hauteur d\'eau en millimètres, séparés par un espace (ex. « O972001001 1500 »). Alerte au franchissement du seuil. Trouvez le code sur hubeau.eaufrance.fr.',
  },
];

// Cache par valeur de param : { above:boolean|null, at, result }.
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

function parseParam(v) {
  const m = PARAM_RE.exec(String(v || '').trim());
  if (!m) return null;
  const seuil = parseFloat(m[3] ? `${m[2]}.${m[3]}` : m[2]);
  return { code: m[1].toUpperCase(), seuil };
}

async function fetchHauteur(code) {
  const url = `${API}?code_entite=${encodeURIComponent(code)}&grandeur_hydro=H&size=1&sort=desc&fields=resultat_obs,date_obs`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try { res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (res.status === 404) return null;
  if (res.status !== 200 && res.status !== 206) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const row = Array.isArray(body.data) ? body.data[0] : null;
  return row && typeof row.resultat_obs === 'number' ? row.resultat_obs : null;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const raw = String((params && params.surveillance) || '');
    const parsed = parseParam(raw);
    if (!parsed) { out.push(Object.assign({ params }, inactive())); continue; }

    const key = raw.trim();
    const entry = cache.get(key);
    if (entry && now - entry.at < CACHE_TTL_MS) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive())); continue; }
    fetches += 1;

    let result;
    try {
      const h = await fetchHauteur(parsed.code);
      if (h == null) {
        result = inactive(); // pas de mesure → référence inchangée
        cache.set(key, { above: entry ? entry.above : null, at: now, result });
      } else {
        const above = h >= parsed.seuil;
        if (!entry || entry.above == null) {
          result = inactive(); // 1er passage : côté mémorisé, AUCUNE alerte
          cache.set(key, { above, at: now, result });
        } else if (above !== entry.above) {
          const sens = above ? `a DÉPASSÉ le seuil de ${parsed.seuil} mm` : `est repassée SOUS le seuil de ${parsed.seuil} mm`;
          result = { state: 'active', since: new Date(), until: null,
            message: `🌊 La station ${parsed.code} ${sens} — hauteur d'eau actuelle ${h} mm.`, url: PUBLIC_URL };
          cache.set(key, { above, at: now, result });
        } else {
          result = inactive();
          cache.set(key, { above, at: now, result });
        }
      }
    } catch (err) {
      console.warn(`[veille-hydrometrie] ${key} : ${err.message} → inactive.`);
      result = inactive();
      cache.set(key, { above: entry ? entry.above : null, at: now, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'veille-hydrometrie', paramsSchema, checkWithParams };
