# Affichage des sources désactivées (enabled=false) — kiosque & page de statut

**Date :** 2026-10-09 · **Statut :** constat lecture seule. Concerne la désactivation à venir de
`sncf-perturbations` et `eruption-volcanique` (scripts `--check`, 0 abonné chacune).

## Ce qui se passe quand `sources.enabled = false`

### Kiosque (liste publique)
`GET /api/sources` filtre `WHERE s.enabled = true` ([server/routes/api.js:140](../../server/routes/api.js#L140)).
→ La source **disparaît complètement** du kiosque. **Il n'existe pas d'état « suspendue »** : elle
n'est pas grisée ni étiquetée, elle n'est tout simplement plus renvoyée. Même filtre pour les favoris
(`JOIN … AND s.enabled = true`, api.js:259) et pour « Mes alertes » (`WHERE s.enabled = true`). Comme
les deux sources visées ont **0 abonné / 0 favori**, aucun utilisateur ne voit de carte disparaître.

### Page de statut publique `/source/<id>/statut`
Le handler SELECT `… WHERE id = $1 AND enabled = true` ([server/index.js:284](../../server/index.js#L284)).
→ Pour une source désactivée, la page renvoie un **404 propre** (pas une erreur serveur) :
> « **Source introuvable** — Cette source n'existe pas ou n'est plus disponible. ← Retour au kiosque »

### Anciens liens `/source/<id>/statut`
Ils restent **compréhensibles** : 404 soigné avec un lien de retour au kiosque, jamais une page cassée
ni une 500. En revanche, le message est **générique** (« n'existe pas ou n'est plus disponible ») — il
ne dit pas « suspendue, nous cherchons une alternative ».

## Point d'attention pour Hugo

Désactiver = **masquage total + 404 générique**. Il n'y a **pas** de statut « suspendue » honnête du
type « la source officielle bloque nos accès, nous cherchons une alternative ». Si tu veux ce message
sur les anciens liens (plutôt qu'un 404 « n'existe plus »), il faudrait une petite évolution de code
(un état « suspendu » rendu par `/source/:id/statut` au lieu du 404) — **hors périmètre**, à décider.
En l'état, pour 0 abonné, le 404 propre est acceptable et sans impact utilisateur.
