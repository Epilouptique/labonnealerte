// Source PARAMÉTRÉE (OpenAlert v2) : risque d'allergie aux pollens, DÉPARTEMENT au choix,
// et ESPÈCE de pollen au choix. Actif si le niveau atteint ÉLEVÉ (≥ 4/6) — anti-spam :
// les niveaux faible/moyen (1..3) sont ignorés. 6 espèces suivies : ambroisie, armoise,
// aulne, bouleau, graminées, olivier.
//
// ⚠️ SOURCE RÉCENTE — À SURVEILLER (Robot 2). La surveillance pollinique a été REPRISE par
// Atmo France / les AASQA en 2025-2026 (décret du 2 mars 2026), après la LIQUIDATION
// JUDICIAIRE du RNSA (26 mars 2025). On NE dépend donc PLUS de pollens.fr / RNSA (organisme
// liquidé), mais du nouvel « indice pollen » Atmo France (open data data.gouv, sans clé).
// Dispositif jeune : sa stabilité (URL, format WFS) est à surveiller — un échec de récupération
// dégrade silencieusement en inactive, jamais de fausse alerte.
//
// Données : connecteur partagé lib/atmo-connector.js (même WFS/agrégation que qualite-air).
// Échelle 1..6, seuil d'alerte = 4. MAJ ~quotidienne à hebdomadaire selon la saison.
//
// ── CHOIX DE L'ESPÈCE (paramètre `taxon`) ───────────────────────────────────────────
// Un abonné allergique aux seules graminées n'a rien à faire d'un pic d'olivier. Les
// niveaux par espèce sont DÉJÀ présents dans le CSV téléchargé : le paramètre ne coûte
// AUCUN appel réseau supplémentaire.
//
// ⚠️ COMPAT ASCENDANTE STRICTE : la clé `departement` est INCHANGÉE, et `taxon` est
// FACULTATIF. Absent (cas de tous les abonnements existants), il vaut « tous » et
// reproduit EXACTEMENT le comportement d'origine — pire cas toutes espèces confondues.
//
// ⚠️ `taxon` est volontairement NON REQUIS : la page de souscription ne rend
// aujourd'hui que le PREMIER paramètre d'un schéma (public/js/source.js). Marqué
// requis, il ferait échouer toute souscription depuis l'interface. Il reste réglable
// via l'URL (?taxon=graminees), comme pour les autres sources multi-champs.

const { getByDept, TAXONS } = require('./lib/atmo-connector');
const { DEPARTEMENTS } = require('../geo');

const PUBLIC_URL = 'https://www.atmo-france.org/article/lindice-pollens';
const SEUIL = 4;
const TOUS = 'tous';

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

// Libellé d'affichage par slug, dérivé du connecteur (source unique de vérité).
const TAXON_NOM = {};
TAXONS.forEach((t) => { TAXON_NOM[t.slug] = t.nom; });

const TAXON_VALUES = [{ value: TOUS, label: 'Toutes les espèces' }].concat(
  TAXONS.map((t) => ({ value: t.slug, label: t.nom.charAt(0).toUpperCase() + t.nom.slice(1) })),
);

const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
  {
    key: 'taxon',
    label: 'Espèce de pollen',
    type: 'enum',
    values: TAXON_VALUES,
    multiple: false,
    required: false, // cf. en-tête : le front ne rend que le 1er paramètre
    default: TOUS,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Valeur de taxon retenue : slug connu, ou « tous » (défaut et repli sûr).
function wantedTaxon(params) {
  const raw = String((params && params.taxon) || TOUS).trim().toLowerCase();
  return TAXON_NOM[raw] ? raw : TOUS;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  let byDept;
  try {
    ({ byDept } = await getByDept('pollens'));
  } catch (err) {
    console.warn('[pollens] appel Atmo échoué (' + err.message + ') → inactive.');
    return combos.map(inactive);
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const info = byDept[dep];
    if (!info) return inactive(params);

    const want = wantedTaxon(params);
    // « tous » → pire cas toutes espèces (comportement historique).
    // Une espèce → uniquement son niveau à elle.
    const level = (want === TOUS) ? info.level : ((info.levels || {})[want]);
    if (!Number.isFinite(level) || level < SEUIL) return inactive(params);

    const nom = NAME[dep] || ('département ' + dep);
    // Espèce nommée : celle choisie, ou celle responsable du pic si « toutes ».
    const espece = (want === TOUS) ? info.taxon : TAXON_NOM[want];
    const precision = espece ? ` (${espece})` : '';
    return {
      params,
      state: 'active',
      since: new Date(),
      until: null,
      // Département en tête, sans article : « dans le ${nom} » est faux pour une
      // bonne partie des 101 départements (« dans le Moselle », « dans le Gironde »).
      // Les articles français sont trop irréguliers pour une règle (« en Moselle »,
      // « dans l'Aisne », « dans les Bouches-du-Rhône », « à Paris ») : on supprime
      // le problème plutôt que de coder les exceptions.
      message: `🤧 ${nom} : risque d'allergie aux pollens ÉLEVÉ${precision} (indice ${level}/6) — personnes allergiques, adaptez traitement et sorties. Source : Atmo France / AASQA.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'pollens', paramsSchema, checkWithParams };
