// scripts/test-dealabs-promo.js — correctif faux positif leboncoin-livraison (28/10/2026).
// Prouve HORS LIGNE (fixtures JSON façon __INITIAL_STATE__, aucune requête réseau, horloge
// injectée) que la détection distingue « annoncée » de « en cours » et n'active jamais une
// promo avant son début effectif. Couvre aussi l'anti-re-notification (ancre `since` stable).
// Lancer : node scripts/test-dealabs-promo.js
'use strict';
const assert = require('assert');
const {
  analyzeDealabs, parseDealabs, parseFrenchDates, isWithinWeekendWindow, isPromoTitle,
} = require('../server/sources/lib/dealabs-promo');

let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };

const TITLE = 'Livraison Mondial Relay chez Leboncoin à 0,99€';
const sec = (...a) => Math.floor(Date.UTC(...a) / 1000); // epoch secondes (format Dealabs)

// Fabrique un objet thread JSON (ordre des champs sans importance pour le parseur borné).
function thread(o) {
  const t = Object.assign({
    title: TITLE, type: 'Deal', isExpired: false, status: 'Activated',
    temperature: 120, publishedAt: sec(2026, 9, 28, 17, 32, 41), description: '',
  }, o);
  return `{"title":"${t.title}","threadTypeId":1,"type":"${t.type}","isExpired":${t.isExpired}`
    + `,"status":"${t.status}","temperature":${t.temperature},"publishedAt":${t.publishedAt}`
    + `,"description":"${t.description}"}`;
}
const page = (arr) => `{"props":{"pageProps":{"threads":[${arr.join(',')}]}}}`;

// Horloges de référence (fin octobre 2026 = CET/UTC+1, DST terminé le 25/10).
const WED_1930 = Date.UTC(2026, 9, 28, 18, 30); // mercredi 28/10 19:30 Paris (jour du bug)
const SAT_1200 = Date.UTC(2026, 9, 31, 11, 0);  // samedi 31/10 12:00 Paris
const THU_2300 = Date.UTC(2026, 9, 29, 22, 0);  // jeudi 29/10 23:00 Paris (nuit jeu→ven)

(async () => {
  console.log('TEST correctif Dealabs (annonce vs en cours, anti-re-notification)');

  // 1) ANNONCE À VENIR — thread réel du 28/10 : offre « du 30 octobre au 2 novembre »,
  //    isExpired=false, mais publié un mercredi AVANT le début → doit rester INACTIVE.
  {
    const html = page([thread({
      publishedAt: sec(2026, 9, 28, 17, 32, 41),
      description: 'Offre valable du 30 octobre 2026 au 2 novembre 2026 inclus',
    })]);
    const r = analyzeDealabs(html, { now: WED_1930 });
    ok(r.matched_count === 1, 'thread réel du 28/10 reconnu (titre pertinent)');
    ok(r.active === false && r.active_count === 0, 'annonce anticipée (début 30/10 futur) → NON active');
  }

  // 2) PROMO EN COURS avec dates lisibles → active, début/fin correctement extraits.
  {
    const html = page([thread({
      publishedAt: sec(2026, 9, 30, 6, 0),
      description: 'Valable du 30 octobre 2026 au 2 novembre 2026',
    })]);
    const r = analyzeDealabs(html, { now: SAT_1200 });
    ok(r.active === true && r.active_count === 1, 'offre en cours (début atteint, fin future) → ACTIVE');
    ok(new Date(r.best.startDate).getDate() === 30 && new Date(r.best.endDate).getDate() === 2,
      'dates lues : début 30, fin 2');
  }

  // 3) THREAD ANCIEN non expiré, sans dates, publié il y a > 4 j, hors fenêtre → inactive.
  {
    const html = page([thread({ publishedAt: Math.floor((WED_1930 - 10 * 86400e3) / 1000), description: '' })]);
    const r = analyzeDealabs(html, { now: WED_1930 });
    ok(r.active === false, 'ancien thread sans dates, hors fenêtre, pub > 4 j → inactive');
  }

  // 4) DISCUSSION (type Discussion) même non expirée → jamais active.
  {
    const html = page([thread({ type: 'Discussion', description: 'du 30 octobre 2026 au 2 novembre 2026', publishedAt: sec(2026, 9, 30, 6, 0) })]);
    const r = analyzeDealabs(html, { now: SAT_1200 });
    ok(r.active === false, 'type Discussion → non active (vrai Deal exigé)');
  }

  // 5) DATES ILLISIBLES hors fenêtre (mercredi) → inactive (garde-fou fenêtre).
  {
    const html = page([thread({ publishedAt: Math.floor((WED_1930 - 3600e3) / 1000), description: '' })]);
    const r = analyzeDealabs(html, { now: WED_1930 });
    ok(r.active === false, 'dates illisibles + mercredi (hors fenêtre) → inactive');
  }

  // 6) VRAIE PROMO DU VENDREDI, nuit jeudi→vendredi, dates illisibles mais pub récente
  //    et dans la fenêtre → ACTIVE (on ne doit pas rater un vrai démarrage).
  {
    const html = page([thread({ publishedAt: Math.floor((THU_2300 - 1800e3) / 1000), description: '' })]);
    const r = analyzeDealabs(html, { now: THU_2300 });
    ok(r.active === true, 'nuit jeudi 23h, pub récente, dates illisibles → ACTIVE (fenêtre)');
  }

  // 7) ANTI-RE-NOTIFICATION : deux cycles sur le même thread actif donnent le MÊME
  //    publishedAt → `since` (ancré dessus) ne bouge pas → pas de « nouvel épisode »
  //    (seuil poller 24 h). On rejoue la condition du poller sans importer la base.
  {
    const html = page([thread({ publishedAt: sec(2026, 9, 30, 6, 0), description: 'du 30 octobre 2026 au 2 novembre 2026' })]);
    const a = analyzeDealabs(html, { now: SAT_1200 });
    const b = analyzeDealabs(html, { now: SAT_1200 + 3600e3 });
    ok(a.best.publishedAt === b.best.publishedAt, 'publishedAt stable d’un cycle à l’autre');
    const EPISODE_MS = 24 * 3600 * 1000;
    const advance = Math.abs((b.best.publishedAt - a.best.publishedAt) * 1000);
    ok(advance < EPISODE_MS, 'avance de `since` < 24 h → aucune re-notification (épisode déjà actif)');
  }

  // 8) Bornes exactes de la fenêtre jeudi 18h → lundi 10h (Europe/Paris).
  ok(isWithinWeekendWindow(Date.UTC(2026, 9, 29, 16, 0)) === false, 'jeudi 17:00 Paris → hors fenêtre');
  ok(isWithinWeekendWindow(Date.UTC(2026, 9, 29, 17, 0)) === true, 'jeudi 18:00 Paris → dans la fenêtre');
  ok(isWithinWeekendWindow(Date.UTC(2026, 10, 2, 8, 59)) === true, 'lundi 09:59 Paris → dans la fenêtre');
  ok(isWithinWeekendWindow(Date.UTC(2026, 10, 2, 9, 0)) === false, 'lundi 10:00 Paris → hors fenêtre');

  // 9) Parsing de dates françaises (formes lettrée et numérique).
  {
    const d1 = parseFrenchDates('du 30 octobre 2026 au 2 novembre 2026', 2026);
    ok(d1.start.getMonth() === 9 && d1.start.getDate() === 30 && d1.end.getDate() === 2, 'forme lettrée : 30 oct → 2 nov');
    const d2 = parseFrenchDates('valable du 30/10/2026 au 02/11/2026', 2026);
    ok(d2.start.getDate() === 30 && d2.end.getDate() === 2, 'forme numérique : 30/10 → 02/11');
    const d3 = parseFrenchDates('aucune date ici', 2026);
    ok(d3.start === null && d3.end === null, 'texte sans date → start/end null');
  }

  // 10) NON-RÉGRESSION : le filtre de titre reste strict (pas de Vinted/Rakuten).
  ok(isPromoTitle(TITLE) === true, 'titre leboncoin pertinent accepté');
  ok(isPromoTitle('Mondial Relay 0,99 € sur Vinted') === false, 'Vinted (sans leboncoin) rejeté');
  ok(parseDealabs(page([`{"title":"Promo bidon","isExpired":false,"publishedAt":1700000000}`])).length === 0,
    'titre non pertinent ignoré par parseDealabs');

  // 11) Fenêtre borne l'objet du thread : les champs d'un thread EXPIRÉ voisin ne
  //     contaminent pas un thread sans champ (cause (c) écartée). Ici le thread actif
  //     précède un thread expiré ; le premier garde isExpired=false.
  {
    const html = page([
      thread({ isExpired: false, publishedAt: sec(2026, 9, 30, 6, 0), description: 'du 30 octobre 2026 au 2 novembre 2026' }),
      thread({ isExpired: true, status: 'Expired', publishedAt: sec(2026, 9, 1, 6, 0) }),
    ]);
    const r = analyzeDealabs(html, { now: SAT_1200 });
    ok(r.matched_count === 2 && r.active_count === 1, 'deux threads : seul l’actif compte, pas de contamination');
  }

  console.log(`\n${passed} OK, ${fails} échec(s).`);
  process.exit(fails ? 1 : 0);
})();
