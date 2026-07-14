// Source interne : Ecogaz (GRTgaz) — signal national de tension du réseau de
// gaz français. Le jumeau « gaz » d'EcoWatt.
//
// API : dataset public "signal-ecogaz" sur ODRÉ (Opendatasoft explore v2.1),
// lecture publique SANS clé (confirmé : HTTP 200 sans authentification).
//   /api/explore/v2.1/catalog/datasets/signal-ecogaz/records
// Champs par enregistrement : gas_day (YYYY-MM-DD), indice_de_couleur ("1".."4"),
// couleur_du_signal_fr, color. Le dataset contient l'historique ET les prévisions
// (J..J+5) → on sélectionne l'enregistrement du jour et celui de demain.
// Signal mis à jour ~11h ; notre poll 30 min convient.
//
// check() rapporte l'état instantané ; la transition vit dans le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/signal-ecogaz/records?order_by=gas_day%20desc&limit=10';
const PUBLIC_URL = 'https://myecogaz.com';
const TIMEOUT_MS = 10_000;

// indice_de_couleur : 1 vert · 2 jaune · 3 orange · 4 rouge.
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };
// Précision affichée selon le niveau.
const PRECISION = {
  3: 'maîtrisez votre consommation de gaz',
  4: 'risque de coupures, réduisez fortement votre consommation',
};

// Date au format YYYY-MM-DD dans le fuseau de Paris (jour « gaz » français).
function parisDay(offsetDays) {
  const base = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  // fr-CA donne un format ISO (AAAA-MM-JJ).
  return new Intl.DateTimeFormat('fr-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris',
  }).format(new Date(base));
}

function dayBounds(dayStr) {
  const start = new Date(dayStr + 'T00:00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Ecogaz (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Ecogaz échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Réponse HTTP inattendue Ecogaz : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Ecogaz illisible (JSON invalide) : ${err.message}`);
  }

  const results = payload && payload.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Structure Ecogaz inattendue : results[] manquant');
  }

  const byDay = new Map();
  results.forEach((r) => { if (r && r.gas_day) byDay.set(r.gas_day, r); });

  const today = parisDay(0);
  const tomorrow = parisDay(1);

  const concerned = [];
  [
    { day: today, rec: byDay.get(today), prefix: "🔥 Aujourd'hui" },
    { day: tomorrow, rec: byDay.get(tomorrow), prefix: '🔥 Demain' },
  ].forEach((e) => {
    if (!e.rec) return;
    const idx = Number(e.rec.indice_de_couleur) || 0;
    if (idx < 3) return; // vert/jaune : rien
    const label = COLOR_LABEL[idx] || 'ORANGE';
    const { start, end } = dayBounds(e.day);
    concerned.push({
      line: `${e.prefix} : réseau de gaz tendu (${label}) — ${PRECISION[idx] || 'maîtrisez votre consommation'}`,
      since: start,
      until: end,
    });
  });

  if (concerned.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  return {
    state: 'active',
    since: concerned[0].since,
    until: concerned[concerned.length - 1].until,
    message: concerned.map((c) => c.line).join('\n'),
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'ecogaz', check };
