// Formatage de dates en français, mutualisé entre sources.
//
// Convention du dépôt : les dates sont manipulées en heure locale (= Europe/Paris
// en dev comme en prod), comme le fait déjà calendar-factory (getDate/getMonth…).
//
// formatDateFr(date, { withTime }) :
//   « 20 juillet »              (date seule, année courante)
//   « 20 juillet à 23h59 »      (withTime: true)
//   « 20 juillet 2027 »         (année ajoutée seulement si ≠ année en cours)
//   « 20 juillet 2027 à 23h59 » (année différente + heure)
//
// NB : sous-dossier lib/ → non chargé comme source par le poller.

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(date, { withTime = false } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const jour = date.getDate();
  const mois = MOIS_FR[date.getMonth()] || `mois ${date.getMonth() + 1}`;
  let out = `${jour} ${mois}`;
  // Année ajoutée uniquement si différente de l'année en cours.
  if (date.getFullYear() !== new Date().getFullYear()) out += ` ${date.getFullYear()}`;
  if (withTime) {
    const mm = String(date.getMinutes()).padStart(2, '0');
    out += ` à ${date.getHours()}h${mm}`;
  }
  return out;
}

module.exports = { formatDateFr, MOIS_FR };
