# RAPPORT IOS-02 : transport push Expo pour l'app iOS

Rien n'a été commité, poussé, migré ni déployé. L'Android n'est pas touché : il reste sur le chemin web-push et UnifiedPush, sans aucune dépendance FCM.

## Phase 1 : exploration

Aucune contradiction avec la demande.

**`push_count`** : ce n'est ni une colonne ni une vue. C'est une sous-requête calculée à chaque sélection d'abonnés :
`(SELECT COUNT(*)::int FROM push_subscriptions p WHERE p.subscriber_id = s.id) AS push_count`.
On la trouve dans `server/poller.js:65` et `server/orgs/municipal-notify.js:15`. `notify-delivery.js` lit seulement `s.push_count > 0`. Les lignes `expo` y comptent donc d'office : un abonné équipé seulement de l'app iOS reçoit bien le push.

**Les trois fonctions d'envoi de `webpush.js`** ne diffèrent que par :

| Fonction | Sélection des lignes |
|---|---|
| `sendToSource` | `JOIN subscriptions` sur `source_id = $1` |
| `sendToSourceParams` | idem, plus `sub.params = $2::jsonb` |
| `sendToSubscriber` | `WHERE subscriber_id = $1`, sans jointure |

La construction du message, l'envoi, le traitement 404/410, le journal et la purge sont identiques, à la mise en forme près. La partie commune est maintenant factorisée dans `sendOne` et `deliverRows`.

**Autres usages de `push_subscriptions`** :

| Fichier | Usage | Effet des lignes `expo` |
|---|---|---|
| `server/routes/myalerts.js:241` | `push_endpoints_count` (compte) | Comptées : c'est voulu. |
| `server/routes/push.js` | routes web subscribe et unsubscribe | Inchangées. |
| `scripts/send-test-push.js:52,95` | test manuel : `web-push` sur la ligne choisie par `--id` | **Échouerait sur une ligne `expo`** (clés NULL). Non modifié : À DÉCIDER. |
| `scripts/send-test-alert.js:111,129` | liste des appareils, `sendToSubscriber` derrière `isEnabled()` | Sans VAPID, le script ne tente rien, alors que le push Expo pourrait partir. Non modifié. |
| `scripts/test-account-deletion.js` | insère une ligne web | Inchangé (`kind` vaut `'web'` par défaut). |
| suppression de compte | `ON DELETE CASCADE` sur `subscriber_id` | Les jetons Expo sont effacés avec le compte. |

**`safe-fetch.js` n'est pas réutilisé.** Il ne fait que GET et HEAD (il n'envoie pas de corps), plafonne la réponse et sert à sécuriser des adresses inconnues contre le SSRF. exp.host est une adresse fixe et de confiance. J'utilise le `fetch` natif de Node (le projet exige Node 18.17 ou plus), injectable dans les tests, avec un délai de 10 s.

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `server/db/init.sql` | `CREATE TABLE push_subscriptions` : `kind` ajouté, `p256dh` et `auth` nullables, contrainte `push_subscriptions_web_keys_chk`. Bloc idempotent ajouté en fin de fichier pour les bases existantes. |
| `server/webpush.js` | `buildPayload`, `sendOne` et `deliverRows` partagés ; transport Expo ; purge sur DeviceNotRegistered ; `ps.kind` dans les trois SELECT ; VAPID n'est plus requis que pour les lignes `web`. |
| `server/routes/push.js` | `POST /api/push/subscribe-expo` et `POST /api/push/unsubscribe-expo`. Les routes web ne sont pas modifiées. |
| `scripts/test-push-transports.js` (nouveau) | 12 tests de `sendOne` et `deliverRows` pour les deux transports, plus le format du jeton. Espions injectés, aucun appel réseau. |

**Un comportement change, comme demandé.** Avant, VAPID absent voulait dire « aucune requête, `{0,0,0}` ». Maintenant, les lignes sont lues : les `web` sont ignorées sans être comptées, les `expo` partent. Avec VAPID présent, le chemin web est strictement identique : même appel `web-push` et même JSON (un test le vérifie).

**Contrat d'API** : `docs/contrat-api-app.md` n'existe pas dans ce dépôt (il est dans `C:\Dev\LabonnealerteApp\docs\`). Je ne l'ai pas créé. Les deux routes à y reporter :

| Méthode | Chemin | Corps | Réponses |
|---|---|---|---|
| POST | `/api/push/subscribe-expo` | `{ token, expo_token }` (le Bearer est accepté, comme ailleurs) | 200 `{ok:true}`, 400 si le jeton Expo est invalide, 401, 503 |
| POST | `/api/push/unsubscribe-expo` | `{ token, expo_token }` | 200 `{ok:true}`, 400, 401, 503 |

Format accepté : `ExponentPushToken[...]` ou `ExpoPushToken[...]`, avec des caractères `A-Z a-z 0-9 _ -` (180 au plus) entre les crochets. L'upsert se fait sur `endpoint`, avec `kind='expo'` et les clés à NULL.

**Barrière** :
- `node --check` sans erreur sur les trois fichiers.
- `test-push-transports` : 12/12.
- Non-régression : `test-notify-delivery-equivalence` 20/20, `test-reviewer-login` 19/19, `test-municipal-notify` 33/33, `test-sources-incident` 38/38, `test-sources-incident-palier1` 45/45.
- Le premier lancement du nouveau test a échoué : il manquait `TOKEN_HASH_SECRET`, exigé au chargement de `sessions.js`. Le test pose désormais une valeur factice.

## SQL à lancer, dans l'ordre, après `railway up`

```sql
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'push_subscriptions'::regclass
       AND conname = 'push_subscriptions_web_keys_chk'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_web_keys_chk
      CHECK (kind <> 'web' OR (p256dh IS NOT NULL AND auth IS NOT NULL));
  END IF;
END $$;
```

Contrôle conseillé : `SELECT kind, COUNT(*) FROM push_subscriptions GROUP BY kind;`. Avant toute inscription iOS, il ne doit y avoir que `web`.

**Ordre de mise en route** : déployer le code **et** passer la migration avant que l'app n'appelle `subscribe-expo`. Sans la colonne `kind`, les trois SELECT de `webpush.js` échouent : il faut migrer juste après `railway up`.

## Reste à faire côté app iOS (`C:\Dev\LabonnealerteMobile`)

1. Après la connexion et l'autorisation des notifications : `getExpoPushTokenAsync`, puis `POST /api/push/subscribe-expo`. Le refaire si le jeton change.
2. À la déconnexion : `POST /api/push/unsubscribe-expo`, puis la purge locale. Rien à faire à la suppression du compte : la cascade s'en charge côté serveur.
3. **Ouverture de la fiche au toucher** : le serveur n'envoie que `data: { url }` (`https://labonnealerte.fr/source/<id>/statut[?params]`). L'app lit aujourd'hui `data.source_id` et `data.event_id` (format du relais). Il faut aussi lire l'id de la source dans `url`.
4. **Doublons** : une fois le push serveur actif, arrêter le relais du PC pour ce compte. Sinon chaque alerte arrive deux fois, car le push serveur ne porte pas d'`event_id` que l'app pourrait reconnaître.
5. Heures calmes : le push Expo passe par la même file de veille que le web, rien à faire.

## Message de commit proposé

```
IOS-02 : transport push Expo pour l'app iOS (push_subscriptions.kind)

- init.sql : colonne kind (web par defaut), p256dh et auth nullables,
  contrainte CHECK, bloc idempotent pour les bases existantes
- webpush.js : helper sendOne/deliverRows commun aux trois envois,
  transport Expo (exp.host), DeviceNotRegistered purge comme 404/410,
  VAPID requis seulement pour les lignes web
- routes/push.js : POST /api/push/subscribe-expo et unsubscribe-expo
- scripts/test-push-transports.js : tests des deux transports sans envoi reel
- Android inchange (UnifiedPush / web-push), aucune dependance FCM
```
