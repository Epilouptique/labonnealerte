// Source calculée : mois et temps forts de sensibilisation (grandes causes).
// Fenêtres COURTES (pas de mois continu d'alerte) pour rester anti-spam.
const { createCalendarSource } = require('./lib/calendar-factory');

// Octobre Rose et Movember : on n'annonce que les tout premiers jours du mois
// (fenêtre d'annonce J-2 + 5 premiers jours), pas tout le mois.
// Téléthon : les 2 jours du week-end (dates annuelles, à vérifier chaque année).
// TODO Sidaction 2027 (week-end fin mars, à confirmer sur sidaction.org)
// TODO Pièces Jaunes 2027 (janvier-février, à confirmer sur fondationhopitaux.fr —
//   2027 non annoncé au 18/07/2026 ; 2026 = 7 janvier-7 février).
// TODO Restos du Cœur — lancement 42e campagne d'hiver (fin novembre 2026, à confirmer
//   sur restosducoeur.org — non annoncé au 18/07/2026 ; 41e lancée le 18 novembre 2025).

function events(now) {
  const y = now.getFullYear();
  const list = [];

  // Récurrents annuels : on calcule pour l'année courante ET la suivante.
  for (const year of [y, y + 1]) {
    // Octobre Rose — 1er au 5 octobre (fin = 6 octobre minuit).
    list.push({
      name: 'Octobre Rose',
      start: new Date(year, 9, 1),
      end: new Date(year, 9, 6),
      message: '🎗️ C\'est Octobre Rose — mois de sensibilisation et de dépistage du cancer du sein',
    });
    // Movember — 1er au 5 novembre (fin = 6 novembre minuit).
    list.push({
      name: 'Movember',
      start: new Date(year, 10, 1),
      end: new Date(year, 10, 6),
      message: '🎗️ C\'est Movember — sensibilisation à la santé masculine (dépistage, santé mentale)',
    });
  }

  // Téléthon 2026 : vendredi 4 et samedi 5 décembre (fin = 6 décembre minuit).
  // TODO 2027 (dates à vérifier chaque année sur afm-telethon.fr).
  list.push({
    name: 'Téléthon 2026',
    start: new Date(2026, 11, 4),
    end: new Date(2026, 11, 6),
    message: '🎗️ C\'est le Téléthon ce week-end — mobilisation contre les maladies génétiques',
  });

  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grandes-causes',
  announceDays: 2,
  url: 'https://www.service-public.gouv.fr/',
  events,
  message(ev) {
    return ev.message;
  },
});
