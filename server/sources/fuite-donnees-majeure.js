// Source : fuite de données majeure, d'après Have I Been Pwned (HIBP).
//
// API officielle documentée, sans clé : GET https://haveibeenpwned.com/api/v3/latestbreach
// → la dernière fuite ajoutée { Name, Title, Domain, AddedDate, PwnCount, … }.
// Retenue si PwnCount ≥ 1 000 000 OU domaine en .fr, et ajoutée il y a moins de 72 h.
// since = AddedDate → chaque nouvelle fuite retenue re-notifie (épisode du poller).
// Conditions (lues le 12/10/2026) : robots.txt n'interdit pas /api/ ; « acceptable
// use » exige un User-Agent identifiable (BOT_UA de safe-fetch) ; licence CC BY 4.0
// → attribution visible + lien vers haveibeenpwned.com dans CHAQUE message.
// La carte ne dit PAS si le compte de l'abonné est touché (dit dans la fiche).

const { safeFetchJson } = require('../safe-fetch');
const { recordFailure, recordSuccess, defaultThreshold } = require('./lib/fail-threshold');

const ID = 'fuite-donnees-majeure';
const API_URL = 'https://haveibeenpwned.com/api/v3/latestbreach';
const SITE_URL = 'https://haveibeenpwned.com/';
const ATTRIBUTION = 'Source : Have I Been Pwned (CC BY 4.0)';
const MIN_PWN = 1_000_000;
const FRESH_MS = 72 * 60 * 60 * 1000;
const MAX_MSG = 120;

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: SITE_URL };
}

function isMajor(b) {
  if (!b) return false;
  const domain = String(b.Domain || '').toLowerCase();
  return Number(b.PwnCount) >= MIN_PWN || /\.fr$/.test(domain);
}

// 6 370 000 → « 6,4 M » ; 487 000 → « 487 000 ».
function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (Math.round(v / 100_000) / 10).toString().replace('.', ',') + ' M';
  return v.toLocaleString('fr-FR').replace(/ | /g, ' ');
}

// Message ≤ 120 caractères, attribution toujours entière : seul le nom est raccourci.
function formatMessage(b) {
  const tail = ` (${formatCount(b.PwnCount)} comptes). ${ATTRIBUTION}`;
  const head = '🔓 Fuite majeure : ';
  let name = String(b.Title || b.Name || 'service inconnu').trim();
  const room = MAX_MSG - head.length - tail.length;
  if (name.length > room) name = name.slice(0, Math.max(1, room - 1)).trimEnd() + '…';
  return head + name + tail;
}

async function check() {
  const key = ID + '::latestbreach';
  let b;
  try {
    b = await safeFetchJson(API_URL, { timeoutMs: 8_000, maxBytes: 64 * 1024, robots: true });
  } catch (err) {
    const r = recordFailure(key, defaultThreshold());
    if (r.escalate) throw new Error(`${ID} : ${r.count} échecs consécutifs (seuil ${r.threshold}) : ${err.message}`);
    console.warn(`[${ID}] échec ${r.count}/${r.threshold} (toléré) : ${err.message}`);
    return inactive();
  }
  recordSuccess(key);

  const added = b && b.AddedDate ? new Date(b.AddedDate) : null;
  if (!added || Number.isNaN(added.getTime()) || !isMajor(b)) return inactive();
  if (Date.now() - added.getTime() >= FRESH_MS) return inactive();

  const url = b.Name ? `https://haveibeenpwned.com/Breach/${encodeURIComponent(b.Name)}` : SITE_URL;
  return { state: 'active', since: added, until: null, message: formatMessage(b), url };
}

module.exports = { id: ID, check, isMajor, formatMessage, formatCount, ATTRIBUTION };
