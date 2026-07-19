// Résolution département FR à partir d'un résultat geoip-lite, pour le PRÉ-REMPLISSAGE
// du profil (champ éditable, jamais activant). Voir profile-autofill.js.
//
// Pourquoi cette approche : geoip-lite ne renvoie NI département NI code postal. Il donne
// country, region (13 régions — trop grossier), city (souvent vide) et ll (lat/lon).
// Observation clé : quand `city` est VIDE, `ll` retombe sur le centroïde par défaut du
// pays (Paris, 48.8582/2.3387, area 500) → utiliser ll dans ce cas devinerait « 75 »
// pour toute IP FR mal localisée. On exige donc `city` non vide (ll alors précis, area
// faible) et on prend le plus proche des 101 centroïdes départementaux ci-dessous.
// Table statique = zéro appel réseau, zéro clé. Une erreur près d'une frontière est sans
// conséquence : le champ est éditable et ne déclenche AUCUNE alerte tant que rien n'est
// confirmé par l'utilisateur.

// Centroïdes géographiques approximatifs (WGS84) des 101 départements.
const DEP_CENTROIDS = [
  { code: '01', lat: 46.10, lon: 5.35 }, { code: '02', lat: 49.57, lon: 3.56 },
  { code: '03', lat: 46.39, lon: 3.19 }, { code: '04', lat: 44.10, lon: 6.24 },
  { code: '05', lat: 44.66, lon: 6.34 }, { code: '06', lat: 43.94, lon: 7.19 },
  { code: '07', lat: 44.75, lon: 4.42 }, { code: '08', lat: 49.60, lon: 4.72 },
  { code: '09', lat: 42.94, lon: 1.53 }, { code: '10', lat: 48.31, lon: 4.17 },
  { code: '11', lat: 43.06, lon: 2.42 }, { code: '12', lat: 44.32, lon: 2.58 },
  { code: '13', lat: 43.54, lon: 5.09 }, { code: '14', lat: 49.10, lon: -0.25 },
  { code: '15', lat: 45.06, lon: 2.66 }, { code: '16', lat: 45.72, lon: 0.16 },
  { code: '17', lat: 45.75, lon: -0.65 }, { code: '18', lat: 47.08, lon: 2.50 },
  { code: '19', lat: 45.35, lon: 1.87 }, { code: '2A', lat: 41.86, lon: 8.90 },
  { code: '2B', lat: 42.40, lon: 9.20 }, { code: '21', lat: 47.46, lon: 4.79 },
  { code: '22', lat: 48.40, lon: -2.86 }, { code: '23', lat: 46.07, lon: 2.02 },
  { code: '24', lat: 45.13, lon: 0.72 }, { code: '25', lat: 47.16, lon: 6.36 },
  { code: '26', lat: 44.73, lon: 5.14 }, { code: '27', lat: 49.08, lon: 0.95 },
  { code: '28', lat: 48.44, lon: 1.39 }, { code: '29', lat: 48.25, lon: -4.09 },
  { code: '30', lat: 43.99, lon: 4.22 }, { code: '31', lat: 43.35, lon: 1.22 },
  { code: '32', lat: 43.66, lon: 0.44 }, { code: '33', lat: 44.87, lon: -0.43 },
  { code: '34', lat: 43.60, lon: 3.42 }, { code: '35', lat: 48.18, lon: -1.68 },
  { code: '36', lat: 46.81, lon: 1.53 }, { code: '37', lat: 47.22, lon: 0.68 },
  { code: '38', lat: 45.28, lon: 5.58 }, { code: '39', lat: 46.78, lon: 5.71 },
  { code: '40', lat: 43.99, lon: -0.75 }, { code: '41', lat: 47.62, lon: 1.34 },
  { code: '42', lat: 45.73, lon: 4.17 }, { code: '43', lat: 45.09, lon: 3.83 },
  { code: '44', lat: 47.35, lon: -1.63 }, { code: '45', lat: 47.91, lon: 2.26 },
  { code: '46', lat: 44.62, lon: 1.62 }, { code: '47', lat: 44.36, lon: 0.45 },
  { code: '48', lat: 44.53, lon: 3.50 }, { code: '49', lat: 47.39, lon: -0.55 },
  { code: '50', lat: 49.10, lon: -1.32 }, { code: '51', lat: 48.99, lon: 4.36 },
  { code: '52', lat: 48.11, lon: 5.13 }, { code: '53', lat: 48.15, lon: -0.66 },
  { code: '54', lat: 48.77, lon: 6.15 }, { code: '55', lat: 49.00, lon: 5.37 },
  { code: '56', lat: 47.83, lon: -2.82 }, { code: '57', lat: 49.02, lon: 6.53 },
  { code: '58', lat: 47.12, lon: 3.52 }, { code: '59', lat: 50.53, lon: 3.24 },
  { code: '60', lat: 49.42, lon: 2.42 }, { code: '61', lat: 48.59, lon: 0.13 },
  { code: '62', lat: 50.51, lon: 2.35 }, { code: '63', lat: 45.72, lon: 3.14 },
  { code: '64', lat: 43.30, lon: -0.76 }, { code: '65', lat: 43.04, lon: 0.15 },
  { code: '66', lat: 42.60, lon: 2.55 }, { code: '67', lat: 48.65, lon: 7.57 },
  { code: '68', lat: 47.87, lon: 7.24 }, { code: '69', lat: 45.87, lon: 4.66 },
  { code: '70', lat: 47.64, lon: 6.09 }, { code: '71', lat: 46.65, lon: 4.53 },
  { code: '72', lat: 48.02, lon: 0.19 }, { code: '73', lat: 45.49, lon: 6.43 },
  { code: '74', lat: 46.05, lon: 6.42 }, { code: '75', lat: 48.86, lon: 2.34 },
  { code: '76', lat: 49.66, lon: 1.00 }, { code: '77', lat: 48.62, lon: 2.99 },
  { code: '78', lat: 48.80, lon: 1.90 }, { code: '79', lat: 46.55, lon: -0.32 },
  { code: '80', lat: 49.92, lon: 2.30 }, { code: '81', lat: 43.79, lon: 2.15 },
  { code: '82', lat: 44.02, lon: 1.35 }, { code: '83', lat: 43.40, lon: 6.24 },
  { code: '84', lat: 44.05, lon: 5.15 }, { code: '85', lat: 46.67, lon: -1.42 },
  { code: '86', lat: 46.56, lon: 0.46 }, { code: '87', lat: 45.89, lon: 1.25 },
  { code: '88', lat: 48.16, lon: 6.42 }, { code: '89', lat: 47.85, lon: 3.56 },
  { code: '90', lat: 47.63, lon: 6.87 }, { code: '91', lat: 48.53, lon: 2.24 },
  { code: '92', lat: 48.84, lon: 2.24 }, { code: '93', lat: 48.91, lon: 2.48 },
  { code: '94', lat: 48.78, lon: 2.47 }, { code: '95', lat: 49.08, lon: 2.13 },
  { code: '971', lat: 16.24, lon: -61.55 }, { code: '972', lat: 14.64, lon: -61.02 },
  { code: '973', lat: 4.00, lon: -53.00 }, { code: '974', lat: -21.13, lon: 55.53 },
  { code: '976', lat: -12.82, lon: 45.16 },
];

// Plus proche centroïde départemental d'un résultat geoip-lite.
// Renvoie un code département (ex. '38', '2A', '974') ou null si non résolu.
// NE renvoie JAMAIS de valeur par défaut : hors France, city vide ou ll absent → null.
function departementFromGeo(geo) {
  if (!geo || geo.country !== 'FR') return null;
  // Garde stricte : sans city, ll = centroïde de repli du pays (non fiable) → on s'abstient.
  if (!geo.city) return null;
  const ll = geo.ll;
  if (!Array.isArray(ll) || ll.length < 2) return null;
  const lat = Number(ll[0]);
  const lon = Number(ll[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Distance équirectangulaire (approx suffisante à l'échelle de la France + DROM).
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = null;
  let bestD = Infinity;
  for (const d of DEP_CENTROIDS) {
    const dLat = lat - d.lat;
    const dLon = (lon - d.lon) * cosLat;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestD) { bestD = dist; best = d.code; }
  }
  return best;
}

module.exports = { DEP_CENTROIDS, departementFromGeo };
