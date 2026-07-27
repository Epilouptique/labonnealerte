// Parseur iCalendar (RFC 5545) minimal, sans dépendance — même esprit que
// lib/feed-parser.js pour RSS/Atom. Le projet n'embarque AUCUNE lib de calendrier
// (vérifié : package.json + node_modules), et en ajouter une pour lire une
// poignée de champs n'est pas justifié.
//
// Extrait les événements { uid, summary, start, allDay, rrule, exdates,
// recurrenceId } et sait développer les répétitions les plus courantes sur une
// fenêtre bornée.
//
// ── PÉRIMÈTRE DES RÉPÉTITIONS (décision explicite) ──────────────────────────
// RÈGLE ABSOLUE : on ne calcule JAMAIS une date d'occurrence qu'on n'est pas
// certain de savoir calculer. Un événement dont la règle sort du périmètre est
// IGNORÉ (et signalé en log), jamais approximé — mieux vaut manquer une alerte
// que d'en inventer une à une fausse date.
//
// SUPPORTÉ : FREQ=DAILY | WEEKLY | MONTHLY | YEARLY, avec INTERVAL, COUNT,
//            UNTIL, BYDAY (uniquement sur WEEKLY), EXDATE, et les occurrences
//            redéfinies individuellement (RECURRENCE-ID).
// IGNORÉ   : toute autre partie de règle (BYMONTHDAY, BYSETPOS, BYMONTH,
//            BYWEEKNO, BYYEARDAY, BYHOUR…), BYDAY hors WEEKLY, et les
//            fréquences SECONDLY/MINUTELY/HOURLY.
//
// EXDATE et RECURRENCE-ID sont traités comme du SUPPORT OBLIGATOIRE, pas comme
// un bonus : sans eux, on annoncerait une occurrence annulée ou déplacée — soit
// exactement la fausse date que la règle ci-dessus interdit.
//
// ── FUSEAUX HORAIRES ────────────────────────────────────────────────────────
// Trois formes de DTSTART constatées dans des flux réels :
//   DTSTART;VALUE=DATE:20260101        → journée entière (minuit, heure locale)
//   DTSTART:20260201T090000Z           → UTC, exact
//   DTSTART:20260201T090000            → heure « flottante » (locale)
//   DTSTART;TZID=Europe/Paris:2026…    → heure d'un fuseau nommé
// Sans base de fuseaux (aucune dépendance), les deux dernières formes sont lues
// comme des heures LOCALES du serveur. L'écart possible est de quelques heures ;
// la fenêtre de préavis se comptant en JOURS, il est sans effet pratique. C'est
// une approximation ASSUMÉE et bornée, pas un calcul faux.

const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const SUPPORTED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
// Parties de règle qu'on sait honorer ; toute autre clé rend la règle non gérée.
const KNOWN_RULE_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST', 'BYDAY']);

const MAX_OCCURRENCES = 5_000; // garde-fou : jamais de boucle non bornée

// RFC 5545 §3.1 : une ligne longue est repliée, la suite commence par un espace
// ou une tabulation. Il faut déplier AVANT toute analyse.
function unfold(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

// RFC 5545 §3.3.11 : échappements dans les valeurs texte.
function unescapeText(v) {
  return String(v || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

// « NOM;PARAM=X;PARAM2=Y:valeur » → { name, params, value }, ou null.
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq === -1) continue;
    params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

// Valeur DATE ou DATE-TIME → { date, allDay } ou null si illisible.
function parseIcsDate(value, params) {
  const v = String(value || '').trim();
  const isDateOnly = (params && params.VALUE === 'DATE') || /^\d{8}$/.test(v);

  if (isDateOnly) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : { date: d, allDay: true };
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s, z] = m;
  // Z → instant UTC exact. Sinon (flottant ou TZID) → heure locale (cf. en-tête).
  const d = z
    ? new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +s))
    : new Date(+y, +mo - 1, +da, +h, +mi, +s);
  return Number.isNaN(d.getTime()) ? null : { date: d, allDay: false };
}

// « FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=2 » → objet, ou null si HORS PÉRIMÈTRE.
// Retourner null est un choix sûr : l'appelant ignorera l'événement.
function parseRRule(value) {
  const rule = {};
  for (const chunk of String(value || '').split(';')) {
    if (!chunk) continue;
    const eq = chunk.indexOf('=');
    if (eq === -1) return null;
    rule[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1).toUpperCase();
  }
  // Une seule partie inconnue suffit à disqualifier la règle entière.
  for (const key of Object.keys(rule)) if (!KNOWN_RULE_PARTS.has(key)) return null;

  const freq = rule.FREQ;
  if (!SUPPORTED_FREQ.has(freq)) return null;

  const interval = rule.INTERVAL ? parseInt(rule.INTERVAL, 10) : 1;
  if (!Number.isFinite(interval) || interval < 1) return null;

  let byday = null;
  if (rule.BYDAY) {
    if (freq !== 'WEEKLY') return null; // BYDAY hors WEEKLY : non géré
    byday = [];
    for (const token of rule.BYDAY.split(',')) {
      // Un préfixe numérique (« 2MO » = 2e lundi) sort du périmètre.
      if (!/^(SU|MO|TU|WE|TH|FR|SA)$/.test(token)) return null;
      byday.push(WEEKDAYS[token]);
    }
    if (!byday.length) return null;
  }

  let count = null;
  if (rule.COUNT) {
    count = parseInt(rule.COUNT, 10);
    if (!Number.isFinite(count) || count < 1) return null;
  }

  let until = null;
  if (rule.UNTIL) {
    const parsed = parseIcsDate(rule.UNTIL, {});
    if (!parsed) return null;
    until = parsed.date;
  }

  return { freq, interval, byday, count, until };
}

// Développe les occurrences d'un événement récurrent dans [from, to].
// Retourne [] si la règle est hors périmètre (jamais de date approximée).
function expandOccurrences(ev, from, to) {
  if (!ev.start) return [];
  if (!ev.rrule) return (ev.start >= from && ev.start <= to) ? [ev.start] : [];

  const { freq, interval, byday, count, until } = ev.rrule;
  const out = [];
  const excluded = new Set(ev.exdates.map((d) => d.getTime()));
  const hardStop = until && until < to ? until : to;

  const base = ev.start;
  const h = base.getHours();
  const mi = base.getMinutes();
  const s = base.getSeconds();
  let emitted = 0; // occurrences depuis DTSTART (pour COUNT)
  let guard = 0;

  // Émet une occurrence candidate ; false si on doit arrêter la série.
  const push = (d) => {
    if (count !== null && emitted >= count) return false;
    emitted += 1;
    if (until && d > until) return false;
    if (d >= from && d <= to && !excluded.has(d.getTime())) out.push(new Date(d));
    return true;
  };

  if (freq === 'WEEKLY' && byday) {
    // Semaine de référence = celle de DTSTART, ramenée au dimanche.
    const weekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay(), h, mi, s);
    for (let w = 0; guard++ < MAX_OCCURRENCES; w += interval) {
      const wk = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * 7, h, mi, s);
      if (wk > hardStop && wk > from) break;
      let stopped = false;
      for (const dow of [...byday].sort((a, b) => a - b)) {
        const d = new Date(wk.getFullYear(), wk.getMonth(), wk.getDate() + dow, h, mi, s);
        if (d < base) continue; // avant DTSTART : n'existe pas
        if (!push(d)) { stopped = true; break; }
      }
      if (stopped) break;
    }
    return out;
  }

  for (let i = 0; guard++ < MAX_OCCURRENCES; i += 1) {
    let d;
    if (freq === 'DAILY') {
      d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * interval, h, mi, s);
    } else if (freq === 'WEEKLY') {
      d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * interval * 7, h, mi, s);
    } else if (freq === 'MONTHLY') {
      d = new Date(base.getFullYear(), base.getMonth() + i * interval, base.getDate(), h, mi, s);
      // 31 du mois dans un mois court → JS déborde sur le mois suivant. La RFC
      // dit de sauter cette occurrence, pas de la décaler.
      // Une date inexistante est sautée SANS consommer de COUNT (RFC 5545).
      if (d.getDate() !== base.getDate()) continue;
    } else { // YEARLY
      d = new Date(base.getFullYear() + i * interval, base.getMonth(), base.getDate(), h, mi, s);
      if (d.getDate() !== base.getDate()) continue; // 29 février
    }
    if (d > hardStop && d > from) break;
    if (!push(d)) break;
  }
  return out;
}

// texte ICS → { calName, events, skipped }
// events : { uid, summary, start, allDay, rrule, exdates, recurrenceId }
// skipped : nombre d'événements écartés parce que leur règle sort du périmètre.
function parseIcs(text) {
  const unfolded = unfold(text);
  const calName = (unfolded.match(/^X-WR-CALNAME:(.*)$/m) || [])[1];

  const events = [];
  let skipped = 0;
  const blocks = unfolded.match(/BEGIN:VEVENT\n[\s\S]*?END:VEVENT/g) || [];

  for (const rawBlock of blocks) {
    // Un VEVENT peut contenir un VALARM, dont les champs ne sont PAS les siens.
    const block = rawBlock.replace(/BEGIN:VALARM\n[\s\S]*?END:VALARM\n?/g, '');
    const ev = { uid: null, summary: '', start: null, allDay: false, rrule: null, exdates: [], recurrenceId: null };
    let unsupportedRule = false;

    for (const line of block.split('\n')) {
      const p = parseLine(line);
      if (!p) continue;
      switch (p.name) {
        case 'UID': ev.uid = p.value.trim(); break;
        case 'SUMMARY': ev.summary = unescapeText(p.value); break;
        case 'DTSTART': {
          const d = parseIcsDate(p.value, p.params);
          if (d) { ev.start = d.date; ev.allDay = d.allDay; }
          break;
        }
        case 'RECURRENCE-ID': {
          const d = parseIcsDate(p.value, p.params);
          if (d) ev.recurrenceId = d.date;
          break;
        }
        case 'RRULE': {
          const r = parseRRule(p.value);
          if (r) ev.rrule = r; else unsupportedRule = true;
          break;
        }
        case 'EXDATE': {
          for (const one of p.value.split(',')) {
            const d = parseIcsDate(one, p.params);
            if (d) ev.exdates.push(d.date);
          }
          break;
        }
        case 'STATUS':
          // Événement annulé : il ne doit jamais déclencher d'alerte.
          if (p.value.trim().toUpperCase() === 'CANCELLED') unsupportedRule = true;
          break;
        default: break;
      }
    }

    if (!ev.start || !ev.uid) continue;
    if (unsupportedRule) { skipped += 1; continue; }
    events.push(ev);
  }

  return { calName: calName ? unescapeText(calName) : '', events, skipped };
}

// Toutes les occurrences de tous les événements dans [from, to], triées.
// Retourne [{ uid, summary, start, allDay, key }] — key identifie UNE occurrence
// (un événement récurrent partage un seul UID pour toutes ses dates).
function occurrencesInWindow(parsed, from, to) {
  // Une occurrence redéfinie (RECURRENCE-ID) remplace celle de la série : on
  // retire la date d'origine du développement de la série mère.
  const overrides = new Map();
  for (const ev of parsed.events) {
    if (!ev.recurrenceId) continue;
    const list = overrides.get(ev.uid) || [];
    list.push(ev.recurrenceId.getTime());
    overrides.set(ev.uid, list);
  }

  const out = [];
  for (const ev of parsed.events) {
    const dropped = !ev.recurrenceId ? (overrides.get(ev.uid) || []) : [];
    for (const start of expandOccurrences(ev, from, to)) {
      if (dropped.includes(start.getTime())) continue;
      out.push({
        uid: ev.uid,
        summary: ev.summary || 'Événement',
        start,
        allDay: ev.allDay,
        key: `${ev.uid}@${start.toISOString()}`,
      });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

module.exports = {
  parseIcs, occurrencesInWindow, expandOccurrences, parseRRule, parseIcsDate, unfold, unescapeText,
};
