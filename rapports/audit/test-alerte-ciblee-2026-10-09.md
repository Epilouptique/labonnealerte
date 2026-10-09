# Test ciblé d'une alerte réelle pour UN compte (sans impacter les autres)

**Date :** 2026-10-09 · **Statut :** mécanisme livré, NON déployé, testé en simulation seulement.

## Chemin réel d'une alerte (vérifié dans le code)

Une alerte atteint l'app par **deux canaux** :
1. **Push (UnifiedPush = Web Push)** — le poller appelle `webpush.sendToSubscriber(abonné, info)`
   ([server/webpush.js:150](../../server/webpush.js#L150)) : notification vers les appareils de **cet
   abonné uniquement**, payload `{ title: nom source, body: message, url }`.
2. **Liste in-app / vérification périodique** — `GET /api/app/events`
   ([server/routes/app-api.js:205](../../server/routes/app-api.js#L205)) lit la table **`source_events`**.
   Or `source_events` est **par SOURCE** (colonnes `id, source_id, event, message, created_at` — **aucune
   colonne d'abonné**). La visibilité par abonné vient de `EXISTS (subscriptions …)` : **tout événement
   d'une source est donc visible par TOUS ses abonnés**. Idem `/api/my-alerts/history`.

## Ce qui est possible / impossible

- **Impossible** de rendre un événement de test visible dans la **liste in-app** du seul compte de Hugo
  sans soit (a) insérer une ligne `source_events` → visible par **tous** les abonnés de « tarif streaming
  netflix », soit (b) **modifier et déployer** la requête `/api/app/events` pour un ciblage par abonné.
  Les deux violent les contraintes (ne pas toucher les autres / ne pas déployer).
- **Possible et totalement isolé** : reproduire l'expérience **par le canal PUSH**, byte-identique à une
  vraie alerte, vers les **seuls appareils du compte visé**. C'est l'alternative la plus sûre, retenue ici.

## Mécanisme livré : `scripts/send-test-alert.js`

Réutilise le **code de production** `sendToSubscriber` → payload et canal identiques à une vraie alerte.
Titre = **nom réel de la source** ; corps = message réel (par défaut, le libellé exact de la source ;
`hausse-tarif-streaming`/`netflix` : « 💶 Changement détecté sur la page des tarifs Netflix… ») ;
`url` = l'URL réelle. Modes : `--check` (simulation, défaut), `--send` (envoi réel au seul compte),
`--cleanup` (ne fait rien — voir garanties). Option `--label-test` pour préfixer « [Test] » si souhaité
(par défaut : rendu identique).

### Garanties (par construction)
- **Aucun autre abonné** : envoi limité aux `push_subscriptions` du `subscriber_id` résolu par `--email`.
- **Aucun e-mail** : le mailer n'est jamais appelé.
- **Aucune écriture** sur `source_events`, `source_states`, `counters`, ni l'historique public : le script
  n'écrit RIEN de tout cela → **rien à nettoyer**, rien n'« expire » (l'alerte de test n'existe que comme
  notification transitoire sur le téléphone). `--cleanup` le confirme et ne touche pas la base.
- Seule écriture possible, **héritée de la prod** : purge d'un endpoint push MORT (404/410) **de ce compte**
  — jamais un état partagé ni un compteur.
- **Kiosque / page statut / historique public : inchangés** (aucun événement, aucun état écrit).

### Pré-requis réel
Le push ne part que si l'app du compte a **enregistré une souscription push** (ligne `push_subscriptions`).
Vérifié en simulation : le compte abonné à `netflix` a actuellement **0 appareil** → `--send` n'enverrait
à personne tant que la notification n'est pas activée dans l'app. À activer côté téléphone d'abord.

## Test effectué (simulation uniquement)
`--check` sur le compte réellement abonné : source « Tarif streaming », payload
`{"title":"Tarif streaming","body":"💶 Changement détecté sur la page des tarifs Netflix…","url":"https://help.netflix.com/fr/node/24926"}`,
0 appareil, **aucune écriture**. Conforme.
