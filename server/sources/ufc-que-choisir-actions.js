// Source : alertes consommateurs UFC-Que Choisir. BROADCAST, pattern « dernier
// item frais » (cert-fr généralisé).
//
// Flux RSS global vérifié live le 20/07/2026 (30 items) :
//   https://www.quechoisir.org/utils/flux
//
// ── CHOIX DE FILTRAGE (observation réelle du flux) ───────────────────────────
// Le flux est GLOBAL et VOLUMINEUX : il mêle articles d'actualité, comparateurs et
// cartes interactives. Il n'expose AUCUNE balise <category> exploitable (vérifié),
// donc pas de tag « Action » à filtrer côté flux. Le type d'item est en revanche
// lisible dans l'URL (…/actualite-…, …/action-…, …/comparateur-…, …/carte-…) et le
// préfixe de titre.
// Pour rester fidèle à l'intention (« actions de groupe / alertes consommateurs »)
// SANS bruit, on ne retient que :
//   (1) les items d'actualité ou d'action (URL /actualite- ou /action-), en excluant
//       comparateurs/cartes/guides ; ET
//   (2) parmi eux, ceux dont le titre porte un signal d'alerte conso (rappel, alerte,
//       arnaque, fraude, danger, action de groupe/collective, mise en garde, recours…).
// On accepte de privilégier la PRÉCISION (rater une actu neutre) sur le rappel, pour
// éviter de notifier des news génériques (taux du Livret A, comparatifs…). Volume
// résultant faible → fenêtre de fraîcheur 72 h sans spam.

const { createRssAlerteSource, shorten } = require('./lib/rss-alerte');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Signaux d'alerte conso (sans accent).
const ALERTE_KW = [
  'rappel', 'alerte', 'arnaque', 'fraude', 'danger', 'dangereu',
  'action de groupe', 'action collective', 'class action', 'mise en garde',
  'escroqu', 'contamination', 'intoxication', 'retrait', 'recours collectif',
];

function isAlerteConso(it) {
  const link = norm(it.link);
  // (1) actualité ou action seulement (exclut comparateur/carte/guide/decryptage-outil).
  if (!/\/(actualite|action)[-/]/.test(link)) return false;
  // (2) signal d'alerte dans le titre (ou l'URL).
  const hay = norm(it.title) + ' ' + link;
  return ALERTE_KW.some((kw) => hay.includes(kw));
}

// Retire le préfixe éditorial « Actualité - » / « Action - » et nettoie.
function cleanTitle(title) {
  return String(title || '').replace(/^\s*(actualit[ée]|action)\s*-\s*/i, '').trim();
}

module.exports = createRssAlerteSource({
  id: 'ufc-que-choisir-actions',
  urls: ['https://www.quechoisir.org/utils/flux'],
  url: 'https://www.quechoisir.org/',
  freshDays: 3,
  filter: isAlerteConso,
  format: (it) => `🛒 UFC-Que Choisir : ${shorten(cleanTitle(it.title))}`,
});
