// BUDGET JOURNALIER DES APPELS IPLOCATE — compteur lisible + plafond dur.
//
// POURQUOI. Le plan IPLocate utilisé par le projet est limité à 1000 requêtes par jour.
// Deux endroits appellent l'API :
//   1. server/profile-autofill.js — pré-remplissage géo du profil. Volume BORNÉ depuis le
//      correctif v42 : la tentative est marquée ('auto' ou 'auto-none') et n'est plus
//      rejouée, donc ~1 appel par compte, une seule fois, et plus rien ensuite (avant v42,
//      un lookup partait à CHAQUE chargement du tableau de bord tant qu'un champ restait
//      vide — c'était la fuite de quota).
//   2. server/index.js — middleware de diagnostic [ip-geo-diag], actif UNIQUEMENT si
//      LOG_CLIENT_IP=1. Volume NON borné par nature : un appel par page HTML servie. C'est
//      le seul chemin qui peut épuiser le quota à lui seul.
//
// CE QUE FAIT CE MODULE. Il compte les appels par JOUR (UTC) et les refuse au-delà du
// budget, en journalisant :
//   · une ligne par appel          → `[iplocate] 2026-10-04 appel 42/1000 (autofill)`
//   · un avertissement à 80 %      → `[iplocate] SEUIL 80 % ATTEINT ...` (une fois par jour)
//   · un refus net au plafond      → `[iplocate] BUDGET JOURNALIER ATTEINT ...` (une fois)
// Le compteur est persisté dans la table `counters` (clés `iplocate_YYYYMMDD`), déjà
// utilisée par le poller pour checks_*/emails_* : aucun schéma nouveau, et le total
// survit à un redéploiement. L'écriture est best-effort et ne bloque jamais l'appelant ;
// en cas de base indisponible, le compte mémoire du processus fait seul référence.
//
// Lecture : `node scripts/iplocate-quota-readonly.js` (SELECT uniquement).

const { pool } = require('./db');

const DAILY_BUDGET = 1000;        // plan IPLocate : 1000 requêtes / jour
const WARN_RATIO = 0.8;           // seuil d'avertissement demandé : 80 %
const WARN_AT = Math.floor(DAILY_BUDGET * WARN_RATIO);

function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }          // 2026-10-04
function counterKey(day) { return 'iplocate_' + day.replace(/-/g, ''); }          // iplocate_20261004

// État mémoire du jour courant. `loaded` : le total déjà en base a-t-il été repris ?
let state = { day: dayKey(), count: 0, loaded: false, warned: false, blocked: false };

function rollIfNewDay() {
  const today = dayKey();
  if (state.day !== today) state = { day: today, count: 0, loaded: false, warned: false, blocked: false };
}

// Reprend le total du jour déjà écrit en base (redéploiement en cours de journée).
// Best-effort : une base indisponible laisse simplement le compte mémoire à 0.
async function loadToday() {
  if (state.loaded) return;
  state.loaded = true; // posé AVANT l'await : deux appels concurrents ne chargent qu'une fois
  try {
    const { rows } = await pool.query('SELECT value FROM counters WHERE key = $1', [counterKey(state.day)]);
    const v = rows[0] ? Number(rows[0].value) : 0;
    if (Number.isFinite(v) && v > state.count) state.count = v;
  } catch (err) {
    console.warn('[iplocate] total du jour illisible (' + err.message + ') — comptage mémoire seul.');
  }
}

// Incrément persistant best-effort (même UPSERT que les compteurs du poller).
function persist(day) {
  pool.query(
    `INSERT INTO counters (key, value) VALUES ($1, 1)
     ON CONFLICT (key) DO UPDATE SET value = counters.value + 1`,
    [counterKey(day)]
  ).catch((err) => console.warn('[iplocate] compteur non persisté (' + err.message + ').'));
}

/**
 * Réserve UN appel IPLocate. Renvoie false si le budget du jour est épuisé — l'appelant
 * doit alors s'abstenir d'appeler l'API (et se comporter comme une résolution absente).
 * @param {string} reason étiquette de journal ('autofill', 'ip-geo-diag'…)
 * @returns {Promise<boolean>}
 */
async function reserve(reason) {
  rollIfNewDay();
  await loadToday();
  if (state.count >= DAILY_BUDGET) {
    if (!state.blocked) {
      state.blocked = true;
      console.error(`[iplocate] BUDGET JOURNALIER ATTEINT (${DAILY_BUDGET} appels le ${state.day}) ` +
        `— appels suspendus jusqu'à demain (UTC). Chemin demandeur : ${reason}.`);
    }
    return false;
  }
  state.count += 1;
  persist(state.day);
  console.log(`[iplocate] ${state.day} appel ${state.count}/${DAILY_BUDGET} (${reason})`);
  if (!state.warned && state.count >= WARN_AT) {
    state.warned = true;
    console.warn(`[iplocate] SEUIL 80 % ATTEINT : ${state.count}/${DAILY_BUDGET} appels le ${state.day}. ` +
      `Si LOG_CLIENT_IP=1 est encore posé sur Railway, c'est le diagnostic [ip-geo-diag] qui consomme ` +
      `le quota (un appel par page HTML servie) : le retirer suffit à revenir au volume du seul ` +
      `pré-remplissage de profil (cf. docs/rotation-identifiants.md).`);
  }
  return true;
}

/** Lecture seule du compteur mémoire (tests / diagnostic). */
function snapshot() { rollIfNewDay(); return { day: state.day, count: state.count, budget: DAILY_BUDGET, warnAt: WARN_AT }; }

module.exports = { reserve, snapshot, DAILY_BUDGET, WARN_AT, counterKey, dayKey };
