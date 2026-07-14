// Source interne : Vigilance crues (Vigicrues / SCHAPI) pour les Hautes-Alpes.
// API publique officielle, SANS clé ni compte. Licence Ouverte Etalab :
// l'origine est citée (« Source officielle Vigicrues (SCHAPI) »).
//
// Endpoint : InfoVigiCru.geojson — FeatureCollection de tous les tronçons de
// vigilance crues avec leur niveau courant (propriété NivInfViCr).
//   1 = vert · 2 = jaune · 3 = orange · 4 = rouge (même sémantique que la météo)
// (Le chemin versionné /services/1/… renvoie une 302 vers /services/… ;
//  on interroge directement l'URL finale.)
//
// TRONÇONS SURVEILLÉS — Hautes-Alpes (05) :
// Constat d'exploration : Vigicrues ne surveille PAS les torrents amont du 05
// (Buëch, Guil, Ubaye, Haute Durance en amont de Serre-Ponçon ne sont pas des
// tronçons). Les tronçons qui drainent réellement le 05 sont les sections
// Durance ci-dessous (filtrage géographique par bbox du 05 + vérification des
// libellés). Drac aval / Romanche aval, dont l'amont est dans le 05 mais dont
// la section surveillée est en Isère, sont volontairement exclus.
//   GA30 — Durance de Serre-Ponçon à Sisteron (traverse le SE du 05)
//   GA21 — Durance de Sisteron à Cadarache (limite 04/05 à Sisteron)
const TRONCONS_05 = {
  GA30: 'Durance de Serre-Ponçon à Sisteron',
  GA21: 'Durance de Sisteron à Cadarache',
};

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson';
const PUBLIC_URL = 'https://www.vigicrues.gouv.fr';
const TIMEOUT_MS = 10_000;

// Niveaux orange/rouge → libellé. Le jaune (2), fréquent en montagne, est exclu
// (cohérent avec la source vigilance-meteo-05).
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };
const NIVEAU_LABEL = { 1: 'vert', 2: 'jaune', 3: 'orange', 4: 'rouge' };

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout API Vigicrues (>${TIMEOUT_MS} ms)`);
    }
    throw new Error(`Appel API Vigicrues échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue Vigicrues : ${res.status} ${res.statusText}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Vigicrues illisible (JSON invalide) : ${err.message}`);
  }

  const features = payload && payload.features;
  if (!Array.isArray(features)) {
    throw new Error('Structure Vigicrues inattendue : features manquant');
  }

  // Évalue chaque tronçon surveillé du 05.
  let maxLevel = 0;
  let evaluated = 0;
  const concerned = []; // libellés des tronçons en orange/rouge

  for (const f of features) {
    const p = f && f.properties;
    if (!p || !(p.CdEntCru in TRONCONS_05)) continue;
    evaluated += 1;
    const level = Number(p.NivInfViCr) || 0;
    if (level > maxLevel) maxLevel = level;
    if (level >= 3) concerned.push(p.lbentcru || TRONCONS_05[p.CdEntCru]);
  }

  console.log(
    `[poller] vigicrues-05 : ${evaluated} tronçon(s) évalué(s), max=${NIVEAU_LABEL[maxLevel] || 'inconnu'}`
  );

  if (evaluated === 0) {
    // Aucun des tronçons attendus n'est présent : structure/codes ont changé.
    throw new Error('Aucun tronçon 05 trouvé dans la réponse Vigicrues (codes obsolètes ?)');
  }

  if (maxLevel < 3) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const colorLabel = COLOR_LABEL[maxLevel] || 'ORANGE';
  return {
    state: 'active',
    since: new Date(), // l'API ne publie pas de début d'épisode → première détection
    until: null, // fin inconnue par nature
    message: `🌊 Vigilance crues ${colorLabel} : ${concerned.join(', ')}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'vigicrues-05', check };
