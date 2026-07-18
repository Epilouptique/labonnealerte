// Source calculée : essai mensuel des sirènes du SAIP (Système d'Alerte et
// d'Information des Populations). Règle nationale FIXE : le 1er mercredi de chaque
// mois à midi, un signal d'essai est diffusé (~1 min 41 s, montant-descendant).
// Zéro API, zéro TODO — entièrement recalculé. C'est la carte « anti-anxiété » de la
// vague risques : elle prévient, calmement, que le son entendu est un simple test.
//
// Fenêtre : le jour J uniquement (announceDays 0). Message détendu et factuel.
const { createCalendarSource, nthWeekday, formatAvecJour } = require('./lib/calendar-factory');

// Génère les 1ers mercredis de midi sur une fenêtre glissante (mois courant + 3),
// actifs toute la journée J (start 00:00 → end 23:59).
function events(now) {
  const list = [];
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let k = 0; k < 4; k++) {
    const y = base.getFullYear();
    const m = base.getMonth() + k;
    const wed = nthWeekday(y, m, 3, 1, 12); // 1er mercredi à 12h (3 = mercredi)
    list.push({
      start: new Date(wed.getFullYear(), wed.getMonth(), wed.getDate(), 0, 0),
      end: new Date(wed.getFullYear(), wed.getMonth(), wed.getDate(), 23, 59),
      wed,
    });
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'essai-sirenes',
  announceDays: 0, // le jour J uniquement
  url: 'https://www.gouvernement.fr/risques/le-signal-national-d-alerte',
  events,
  message() {
    return '📢 Aujourd\'hui à midi : essai mensuel des sirènes (SAIP). Pas d\'inquiétude, c\'est un simple test, aucune action à prendre.';
  },
});
