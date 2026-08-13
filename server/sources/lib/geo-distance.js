// Lib PARTAGÉE : distance à vol d'oiseau entre deux points (Haversine).
// NB : sous-dossier lib/ → non chargé comme source par le poller.

const EARTH_RADIUS_KM = 6371;

// Distance en km entre (lat1,lon1) et (lat2,lon2). Coordonnées en degrés décimaux.
function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { distanceKm };
