// Heures de veille : plage silencieuse des notifications (email + push).
// Par défaut, aucune notification entre 23h et 8h (Europe/Paris) ; les alertes
// de la nuit sont différées (deferred_notifications) puis envoyées groupées à la
// sortie de plage. Réglable par utilisateur (quiet_start/quiet_end/quiet_disabled).

const DEFAULT_START = 23; // 23h
const DEFAULT_END = 8;    // 8h

// Heure courante (0-23) dans le fuseau Europe/Paris — jamais l'UTC brut.
function parisHour(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  }).format(date);
  // '24' peut apparaître à minuit selon l'implémentation → normalise en 0-23.
  return parseInt(s, 10) % 24;
}

// Fenêtre effective d'un abonné, ou null si la veille est désactivée.
function resolveWindow(sub) {
  if (!sub || sub.quiet_disabled) return null;
  const start = (sub.quiet_start == null) ? DEFAULT_START : Number(sub.quiet_start);
  const end = (sub.quiet_end == null) ? DEFAULT_END : Number(sub.quiet_end);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return { start: DEFAULT_START, end: DEFAULT_END };
  return { start, end };
}

// L'heure `hour` est-elle dans la plage [start, end) ? Gère le passage par minuit
// (ex. 23→8 : actif si hour>=23 OU hour<8). start==end = plage vide (jamais).
function inWindow(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// L'abonné est-il actuellement dans sa plage de veille ?
function isQuietNow(sub, date = new Date()) {
  const w = resolveWindow(sub);
  if (!w) return false;
  return inWindow(parisHour(date), w.start, w.end);
}

module.exports = {
  DEFAULT_START, DEFAULT_END,
  parisHour, resolveWindow, inWindow, isQuietNow,
};
