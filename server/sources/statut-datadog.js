// 2026-11-17 — SOURCE DÉSACTIVÉE EN BASE (enabled = false, cf. init.sql en fin de fichier).
// Datadog a fermé son API Statuspage publique :
//   https://status.datadoghq.com/api/v2/status.json     → 403 Forbidden
//   https://status.datadoghq.com/api/v2/summary.json    → 403 Forbidden
//   https://status.datadoghq.com/api/v2/components.json  → 403 Forbidden
// Testé depuis un poste tiers le 2026-11-17 : le 403 se reproduit → ce n'est PAS un
// blocage d'IP Railway. 130 échecs/7 j en prod, dernier succès le 2026-10-26. Les 37
// autres cartes statut-* répondent 200 ; Datadog est le seul cas.
// Repli RSS ÉCARTÉ : history.rss / history.atom répondent 200 mais ne portent AUCUN
// champ impact (major/critical) → impossible d'y reproduire la règle anti-spam de
// statuspage-factory (« on ne notifie que les pannes majeures ») ; une carte branchée
// dessus alerterait sur tous les incidents, mineurs compris. Réouverture possible si
// Datadog réexpose un statut structuré avec niveau de gravité.
// Le module reste en place (inoffensif) : il n'est plus appelé tant que enabled = false.
const { createStatusSource } = require('./lib/statuspage-factory');
module.exports = createStatusSource({ id: 'statut-datadog', serviceName: 'Datadog', statusHost: 'https://status.datadoghq.com', url: 'https://status.datadoghq.com' });
