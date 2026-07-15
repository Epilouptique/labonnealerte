// Source calculée : rendez-vous célestes à l'œil nu / aux jumelles (Stelvision).
// TODO 2027+ : compléter la liste depuis Stelvision « événements astro » chaque année
// (seul le Quadrantides du 3 janv. 2027 est fourni ici pour la transition d'année).
// NB : Perséides, Géminides, Nuits des étoiles et éclipses sont couverts par
// d'autres sources — ne PAS les dupliquer ici.
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// type ∈ 'opposition' | 'pluie' | 'conjonction'. start/end à minuit local.
// Pour un événement ponctuel (une nuit / une date), end = start + 1 jour.
const CATALOGUE = [
  { name: 'Opposition de Jupiter', type: 'opposition', detail: 'très brillante à l\'œil nu', start: new Date(2026, 0, 10) },
  { name: 'les Lyrides', type: 'pluie', detail: 'pluie d\'étoiles filantes à leur maximum (à l\'œil nu, ciel dégagé)', start: new Date(2026, 3, 21) },
  { name: 'Opposition de Saturne', type: 'opposition', detail: 'ses anneaux visibles aux jumelles', start: new Date(2026, 9, 4) },
  { name: 'les Orionides', type: 'pluie', detail: 'pluie d\'étoiles filantes à leur maximum (à l\'œil nu, ciel dégagé)', start: new Date(2026, 9, 21) },
  { name: 'Conjonction Jupiter–Mars', type: 'conjonction', detail: 'les deux planètes rapprochées dans le Lion', start: new Date(2026, 10, 14), end: new Date(2026, 10, 18) },
  { name: 'Opposition d\'Uranus', type: 'opposition', detail: 'repérable aux jumelles', start: new Date(2026, 10, 25) },
  { name: 'les Quadrantides', type: 'pluie', detail: 'pluie d\'étoiles filantes à leur maximum (à l\'œil nu, ciel dégagé)', start: new Date(2027, 0, 3) },
];

function events(now) {
  return CATALOGUE
    .map((e) => ({
      ...e,
      end: e.end instanceof Date ? e.end : new Date(e.start.getTime() + DAY_MS),
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

function message(ev, phase) {
  const emoji = ev.type === 'pluie' ? '🌠' : '🔭';
  let quand;
  if (phase === 'during') {
    quand = 'Ce soir';
  } else {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate()) - todayMidnight) / DAY_MS);
    if (diffDays <= 0) quand = 'Ce soir';
    else if (diffDays === 1) quand = 'Demain soir';
    else quand = `Le ${formatJourMois(ev.start)} au soir`;
  }
  return `${emoji} ${quand} : ${ev.name}, ${ev.detail}`;
}

module.exports = createCalendarSource({
  id: 'evenements-astro',
  announceDays: 3,
  url: 'https://www.stelvision.com/astro/',
  events,
  message,
});
