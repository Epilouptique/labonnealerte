// Source interne : grandes perturbations nationales SNCF (grève / mouvement social).
//
// API : Navitia SNCF (api.sncf.com), endpoint /coverage/sncf/disruptions.
// Auth Basic : la clé SNCF_API_KEY en identifiant, mot de passe vide.
//
// OBJECTIF BROADCAST : détecter une perturbation NATIONALE majeure, PAS les
// retards du quotidien. Heuristique retenue : parmi les disruptions ACTIVES, on
// cherche « grève » / « mouvement social » dans les messages (insensible à la
// casse et aux accents). C'est le signal robuste et peu bruité pour un broadcast.
//
// NB (calibrage) : le prompt évoquait aussi un seuil sur le VOLUME de disruptions
// severity=NO_SERVICE. Ce seuil ne peut pas être calibré sans clé (aucune mesure
// d'un « jour normal » possible ici) ; l'implémenter à l'aveugle serait bancal.
// Cette branche est donc volontairement omise tant qu'une clé n'est pas fournie
// pour mesurer la valeur de référence. requires_confirmation=TRUE couvre le risque
// de faux positif de l'heuristique par mots-clés.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://api.sncf.com/v1/coverage/sncf/disruptions?count=100';
const PUBLIC_URL = 'https://www.sncf-connect.com/info-trafic';
const TIMEOUT_MS = 10_000;

function normalize(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')        // retire le HTML éventuel des messages
    .replace(/\s+/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sans accents
    .toLowerCase()
    .trim();
}

// Texte concaténé des messages d'une disruption.
function disruptionText(d) {
  const msgs = Array.isArray(d && d.messages) ? d.messages : [];
  return msgs.map((m) => (m && m.text) || '').join(' ');
}

// Résumé court et lisible (HTML retiré) pour le message d'alerte.
function shortSummary(d) {
  const raw = disruptionText(d).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return 'mouvement social en cours';
  return raw.length > 140 ? raw.slice(0, 137) + '…' : raw;
}

async function check() {
  const apiKey = (process.env.SNCF_API_KEY || '').trim();
  if (!apiKey) throw new Error('SNCF_API_KEY absente de l\'environnement');

  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API SNCF (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API SNCF échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Clé API SNCF invalide ou non autorisée (HTTP ${res.status})`);
  }
  if (res.status === 429) throw new Error('Quota API SNCF dépassé (HTTP 429)');
  if (!res.ok) throw new Error(`Réponse HTTP inattendue SNCF : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse SNCF illisible (JSON invalide) : ${err.message}`);
  }
  const disruptions = payload && Array.isArray(payload.disruptions) ? payload.disruptions : [];

  // Disruptions actives mentionnant une grève / un mouvement social.
  const social = disruptions.filter((d) => {
    if (d && d.status && d.status !== 'active') return false;
    const hay = normalize(disruptionText(d));
    return hay.includes('greve') || hay.includes('mouvement social');
  });

  if (social.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const resume = shortSummary(social[0]);
  return {
    state: 'active',
    since: new Date(),
    until: null,
    message: `🚆 Perturbations importantes sur le réseau SNCF : ${resume}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'sncf-perturbations', check };
