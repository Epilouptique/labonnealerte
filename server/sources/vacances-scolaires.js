// Source PARAMÉTRÉE (OpenAlert v2) : vacances scolaires, zone(s) au choix de
// l'abonné (A / B / C). Un seul appel API par cycle (cache mutualisé 24h de la
// vacances-factory), quel que soit le nombre de zones suivies. Remplace les 3
// sources broadcast vacances-zone-a/b/c (migrées + désactivées par init.sql).
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }.
//
// ⚠️ TODO daté (extension DOM-TOM Guadeloupe/Martinique/Guyane — vague outre-mer) :
//   NON FAIT volontairement. La vacances-factory est construite AUTOUR du modèle
//   métropole « Zone A/B/C » : elle fige ZONES = ['Zone A','Zone B','Zone C'],
//   filtre l'API sur ces trois valeurs et reconstruit le libellé via `Zone ${lettre}`.
//   Les zones DOM du dataset officiel portent d'autres noms (« Guadeloupe »,
//   « Martinique », « Guyane »…) qui ne rentrent pas dans ce moule → un ajout
//   naïf casserait le formatage et le filtre. De plus, l'exploration précédente a
//   signalé un RETARD d'ingestion des calendriers DOM côté dataset education.gouv.
//   Forcer l'intégration serait fragile (cf. consigne : « ne pas forcer »).
//   → À traiter proprement plus tard : généraliser la factory (ZONES paramétrable,
//     libellé découplé de « Zone X ») PUIS confirmer la disponibilité des données
//     DOM dans le dataset avant d'exposer les territoires ici.

const { createVacancesParamSource } = require('./lib/vacances-factory');

// Schéma déclaré (identique à celui inséré en base par init.sql).
const paramsSchema = [
  {
    key: 'zone',
    label: 'Zone',
    type: 'enum',
    values: [
      { value: 'A', label: 'Zone A (Besançon, Bordeaux, Clermont, Dijon, Grenoble, Lyon, Poitiers…)' },
      { value: 'B', label: 'Zone B (Aix-Marseille, Lille, Nantes, Nice, Rennes, Rouen, Strasbourg…)' },
      { value: 'C', label: 'Zone C (Paris, Créteil, Versailles, Montpellier, Toulouse)' },
    ],
    multiple: true,
    required: true,
    default: null,
  },
];

module.exports = createVacancesParamSource({ id: 'vacances-scolaires', paramsSchema });
