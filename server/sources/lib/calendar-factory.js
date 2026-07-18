// Factory « source calculée » : zéro API, zéro dépendance. L'état se déduit de
// dates (fixes ou calculables). La source déclare une fonction events(now) qui
// renvoie les prochains événements { name, start:Date, end?:Date, ...extra } ;
// la factory active la source dans une FENÊTRE D'ANNONCE de N jours avant :
//   state 'active' de (start - N jours) à (end || start)
//   since = début de la fenêtre, until = end || start (fin de la période active)
//   message = message(event, phase) où phase = 'before' (avant start) | 'during'
//
// Ajout d'une source calculée : créer un fichier mince qui appelle
// createCalendarSource({ id, announceDays, url, events, message }) + INSERT init.sql.

// n-ième (1-based) `weekday` (0=dim..6=sam) du mois `monthIdx` (0=janv).
function nthWeekday(year, monthIdx, weekday, n, hour = 0) {
  const first = new Date(year, monthIdx, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(year, monthIdx, 1 + shift + (n - 1) * 7, hour);
}

// Dernier `weekday` du mois.
function lastWeekday(year, monthIdx, weekday, hour = 0) {
  const last = new Date(year, monthIdx + 1, 0); // dernier jour du mois
  const shift = (last.getDay() - weekday + 7) % 7;
  return new Date(year, monthIdx, last.getDate() - shift, hour);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// "25 juin" (sans année).
function formatJourMois(d) { return `${d.getDate()} ${MOIS[d.getMonth()]}`; }
// "mercredi 25 juin".
function formatAvecJour(d) { return `${JOURS[d.getDay()]} ${formatJourMois(d)}`; }

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Crée une source dont l'état se calcule à partir de dates.
 * @param {{ id:string, announceDays:number, url:string,
 *           events:(now:Date)=>Array<{start:Date,end?:Date}>,
 *           message:(event:object, phase:'before'|'during')=>string }} cfg
 * @returns {{ id:string, check: () => object }}
 */
function createCalendarSource(cfg) {
  const { id, announceDays, url, events, message } = cfg;

  function check() {
    const now = new Date();
    const list = (typeof events === 'function' ? events(now) : events) || [];
    for (const ev of list) {
      if (!ev || !(ev.start instanceof Date)) continue;
      const windowStart = new Date(ev.start.getTime() - announceDays * DAY_MS);
      const activeEnd = ev.end instanceof Date ? ev.end : ev.start;
      if (now >= windowStart && now <= activeEnd) {
        const phase = now < ev.start ? 'before' : 'during';
        // URL par événement si fournie (ev.url), sinon URL générique de la source.
        return { state: 'active', since: windowStart, until: activeEnd, message: message(ev, phase), url: (ev && ev.url) || url };
      }
    }
    return { state: 'inactive', since: null, until: null, message: null, url };
  }

  // Contrat optionnel pour la page « Le Point » : les événements à venir dans les
  // `days` prochains jours (ou en cours). Renvoie [{ id, start, end, message, url }].
  // Zéro nouvelle donnée : lit la même config que check().
  function upcoming(now, days) {
    const horizon = now.getTime() + (days || 10) * DAY_MS;
    const list = (typeof events === 'function' ? events(now) : events) || [];
    const out = [];
    for (const ev of list) {
      if (!ev || !(ev.start instanceof Date)) continue;
      const activeEnd = ev.end instanceof Date ? ev.end : ev.start;
      if (activeEnd.getTime() < now.getTime()) continue; // déjà passé
      if (ev.start.getTime() > horizon) continue;        // trop loin
      const phase = now < ev.start ? 'before' : 'during';
      out.push({ id, start: ev.start, end: activeEnd, message: message(ev, phase), url: (ev && ev.url) || url });
    }
    return out;
  }

  return { id, check, upcoming };
}

module.exports = {
  createCalendarSource,
  nthWeekday, lastWeekday,
  formatJourMois, formatAvecJour,
};
