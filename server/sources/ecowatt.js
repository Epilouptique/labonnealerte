// Source interne : EcoWatt (RTE) — signal national de tension du système
// électrique français. 2e source API publique officielle, avec OAuth2.
//
// API : /open_api/ecowatt/v5/signals (v4 retiré). Auth Bearer via rte-auth.
// Rate limit strict : 1 appel / 15 min. Le poller tourne toutes les 30 min :
// on ne retente JAMAIS immédiatement en cas d'erreur (throw → prochain cycle).
//
// check() rapporte l'état instantané ; la transition vit dans le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getToken } = require('../rte-auth');

const SIGNALS_URL = 'https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals';
const PUBLIC_URL = 'https://www.monecowatt.fr';
const TIMEOUT_MS = 10_000;

// dvalue : 1 vert · 2 orange · 3 rouge.
const COLOR_LABEL = { 2: 'ORANGE', 3: 'ROUGE' };

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Vérifie l'état instantané EcoWatt (jours J et J+1).
 * @returns {Promise<{ state:'active'|'inactive', since:Date|null, until:Date|null, message:string|null, url:string }>}
 */
async function check() {
  const token = await getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(SIGNALS_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API EcoWatt (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API EcoWatt échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`EcoWatt : token/identifiants refusés (HTTP ${res.status})`);
  }
  if (res.status === 429) {
    throw new Error('EcoWatt : appel trop fréquent (HTTP 429), prochain cycle');
  }
  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue EcoWatt : ${res.status} ${res.statusText}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse EcoWatt illisible (JSON invalide) : ${err.message}`);
  }

  return extractEcowatt(payload);
}

/**
 * Extrait l'état à partir des signaux J et J+1.
 * Structure v5 : { signals: [{ jour (ISO), dvalue (1|2|3), message, values[] }, ...] }
 * signals[0] = aujourd'hui (J), signals[1] = demain (J+1).
 */
function extractEcowatt(payload) {
  const signals = payload?.signals;
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new Error('Structure EcoWatt inattendue : signals[] manquant');
  }

  const today = signals[0];
  const tomorrow = signals[1];
  const concerned = []; // { day, label, message, since, until }

  [{ sig: today, prefix: "⚡ Aujourd'hui" }, { sig: tomorrow, prefix: '⚡ Demain' }].forEach((entry) => {
    const sig = entry.sig;
    if (!sig) return;
    const dvalue = Number(sig.dvalue) || 0;
    if (dvalue < 2) return; // vert : rien
    const label = COLOR_LABEL[dvalue] || 'ORANGE';
    const start = parseDate(sig.jour);
    const end = start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
    concerned.push({
      label,
      line: `${entry.prefix} : ${label} — ${sig.message || 'système électrique tendu'}`,
      since: start,
      until: end,
    });
  });

  if (concerned.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const since = concerned[0].since;
  const until = concerned[concerned.length - 1].until;

  return {
    state: 'active',
    since,
    until,
    message: concerned.map((c) => c.line).join('\n'),
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'ecowatt', check };
