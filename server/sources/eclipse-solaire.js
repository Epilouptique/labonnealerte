// Source calculée : éclipses de Soleil MAJEURES visibles depuis la France (dates connues).
// Fenêtre d'annonce J-7 → jour J. Après l'événement, la source redevient inactive
// jusqu'à l'éclipse suivante déclarée dans ECLIPSES.
//
// NIVEAU 1 — BROADCAST « éclipses majeures » (cette source). Curation MANUELLE, anti-spam :
// on ne liste QUE les éclipses réellement marquantes en France (totales, annulaires, ou
// partielles à forte obscuration), jamais les partielles mineures. Réalité astronomique
// (vérifiée Observatoire de Paris / LTE ex-IMCCE, CNES, Cité de l'espace, juillet 2026) :
// la prochaine éclipse TOTALE en France MÉTROPOLITAINE est le 3 septembre 2081 (la dernière
// remontait à 1999). D'ici là, les événements majeurs sont des partielles PROFONDES (2026 :
// jusqu'à 99,5 % ; totale, elle, depuis le nord de l'Espagne). Un filtre « totales seulement »
// donnerait donc une carte vide pendant des décennies : la curation « majeures » ci-dessous
// est le bon périmètre broadcast. Le taux d'obscuration donné est une FOURCHETTE nationale
// (nord → sud), seule granularité fiable sans calcul d'éphémérides (voir rapport, niveau 2).
//
// ⚠️ TODO au fil du temps : ajouter les prochaines éclipses majeures (métropole ET DOM) une
// fois leurs circonstances publiées par une source officielle ; ne JAMAIS inventer un taux.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Éclipses majeures visibles depuis la France (date locale + note descriptive avec fourchette
// d'obscuration nationale vérifiée). Sources : CNES, Observatoire de Paris/LTE, Cité de l'espace.
const ECLIPSES = [
  { date: '2026-08-12', note: 'éclipse partielle spectaculaire en fin de journée : de ~90 % d\'obscuration au nord (Lille) jusqu\'à ~99,5 % dans le Sud-Ouest (Biarritz) — totale, elle, depuis le nord de l\'Espagne et l\'Islande' },
  { date: '2027-08-02', note: 'éclipse partielle, plus marquée au sud : de ~51 % à Paris jusqu\'à ~72,5 % à Toulouse — totale depuis le sud de l\'Espagne et l\'Afrique du Nord' },
];

function eclipses(now) {
  return ECLIPSES
    .map((e) => {
      const [y, m, d] = e.date.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      return { start, end: new Date(start.getTime() + DAY_MS), note: e.note }; // actif tout le jour J
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'eclipse-solaire',
  announceDays: 7,
  url: 'https://www.afastronomie.fr/',
  events: eclipses,
  message(ev) {
    return `🌒 Éclipse de Soleil ${formatAvecJour(ev.start)} — ${ev.note}. Lunettes de protection homologuées obligatoires, jamais à l'œil nu !`;
  },
});
