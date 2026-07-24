// Source BROADCAST (v1) : ARROSAGE — CANAL DE GAP. Carte THÉMATIQUE pré-remplie par-dessus le
// moteur PanneauPocket. URL en dur (page de l'ASA du Canal de Gap) ; l'abonné n'a rien à saisir.
// Alerte uniquement sur les panneaux liés à l'EAU D'IRRIGATION (arrosage, tours d'eau,
// restrictions, coupures…), les autres panneaux de l'ASA sont ignorés.
//
// Moteur de veille (détection anti-rétroactif, cache TTL 2h, dégradation silencieuse) : factorisé
// dans lib/panneaupocket-veille.js (createBroadcastSource). Ici : URL fixe, filtre thématique
// (prédicat `alertable`) et message spécifique (💧 + lien ASA).
//
// ── FILTRE THÉMATIQUE ────────────────────────────────────────────────────────
//   On mémorise le hash de TOUS les panneaux mais on n'ALERTE que sur les thématiques. Un panneau
//   hors-thème MODIFIÉ pour devenir thématique déclenche proprement (géré par la factory).

const { createBroadcastSource } = require('./lib/panneaupocket-veille');

const VILLE_URL = 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000';
const DETAILS_URL = 'https://www.canaldegap.fr';

// Normalisation pour le filtre : minuscules, sans accents, apostrophes → espace.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mots-clés (déjà normalisés) : arrosage, tour(s) d'eau, restriction, autorisation, remise en
// eau, coupure, irrigation, ressource en eau. Match par sous-chaîne sur titre + texte.
const KEYWORDS = ['arrosage', 'tour d eau', 'tours d eau', 'restriction', 'autorisation', 'remise en eau', 'coupure', 'irrigation', 'ressource en eau'];

function isThematic(item) {
  const hay = normalize(`${item.title} ${item.text}`);
  return KEYWORDS.some((k) => hay.includes(k));
}

// Message d'alerte (mêmes règles que panneaupocket + détails ASA + attribution PanneauPocket).
// La factory appelle buildMessage(events, city, urlObj) ; on ignore city (nom fixe de l'ASA).
function buildMessage(events) {
  const link = (id) => `${VILLE_URL}?panneau=${id}`;
  const tag = (e) => (e.cancelled ? `« ${e.title} » (annulé)` : `« ${e.title} »`);
  const suffix = `Détails : ${DETAILS_URL} (via PanneauPocket)`;

  if (events.length === 1) {
    const e = events[0];
    const verbe = e.kind === 'new' ? 'Nouveau panneau' : 'Panneau mis à jour';
    return `💧 ${verbe} — ASA du Canal de Gap : ${tag(e)}. ${link(e.id)}. ${suffix}`;
  }
  const nNew = events.filter((e) => e.kind === 'new').length;
  const nUpd = events.length - nNew;
  const parts = [];
  if (nNew) parts.push(`${nNew} nouveau${nNew > 1 ? 'x' : ''}`);
  if (nUpd) parts.push(`${nUpd} mis à jour`);
  const titres = events.slice(0, 3).map(tag).join(', ') + (events.length > 3 ? '…' : '');
  // Plusieurs panneaux → lien vers la PAGE VILLE nue (sans ?panneau) pour tout voir.
  return `💧 ${events.length} panneaux arrosage — ASA du Canal de Gap (${parts.join(', ')}) : ${titres}. ${VILLE_URL}. ${suffix}`;
}

const source = createBroadcastSource({ id: 'arrosage-canal-gap', url: VILLE_URL, buildMessage, alertable: isThematic });

module.exports = { id: source.id, check: source.check, _isThematic: isThematic, _buildMessage: buildMessage };
