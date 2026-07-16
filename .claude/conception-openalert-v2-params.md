# Conception — OpenAlert v2 : sources paramétrées (champ `params`)

Statut : document de conception validé sur le principe (une carte paramétrée,
un standard unique rétrocompatible, fusion des vigilances avec migration
automatique). À affiner puis décliner en prompts Claude Code.

---

## 1. Principe

Un manifeste OpenAlert peut désormais déclarer un schéma de **paramètres**.

- Champ `params` **absent** → source *broadcast* : comportement v1 inchangé,
  tout `alert.json` existant reste valide sans modification.
- Champ `params` **présent** → source *paramétrée* : l'abonnement porte des
  valeurs, l'état de l'alerte est évalué **par abonnement** et non par source.

Un seul standard, deux modes, zéro rupture.

## 2. Extension du manifeste (OPENALERT.md)

Ajout d'une section « Sources paramétrées ». Proposition de schéma :

```json
{
  "id": "vigilance-meteo",
  "name": "Vigilance météo",
  "params": [
    {
      "key": "departement",
      "label": "Département",
      "type": "enum",
      "values": [ { "value": "05", "label": "Hautes-Alpes" }, ... ],
      "multiple": true,
      "required": true,
      "default": null
    }
  ]
}
```

Types de paramètre pour la v2 initiale — volontairement peu nombreux :

| type     | usage                              | exemple                |
|----------|------------------------------------|------------------------|
| `enum`   | liste fermée (dept, catégorie…)    | vigilance, RappelConso |
| `string` | texte libre validé par la source   | domaine DoomName       |
| `number` | seuil numérique borné (min/max)    | seuil carburant custom |

`geo` (lat/lon — ISS, marées, UV) est **reporté à une v2.1** : il pose des
questions de vie privée et d'UI qui ne doivent pas retarder le cœur.

Règles :
- `multiple: true` = l'utilisateur peut créer plusieurs instances (plusieurs
  départements) ; chaque instance est un abonnement distinct.
- La plateforme génère l'UI d'abonnement à partir du schéma (select pour
  enum, input validé pour string/number).
- Pour les sources **externes**, l'endpoint est interrogé avec les valeurs
  en query string : `GET alert.json?departement=05`. La réponse reste un
  manifeste v1 classique (id, state, since, message…) évalué pour ces
  valeurs. Un endpoint paramétré DOIT répondre de façon déterministe et
  documenter ses valeurs acceptées.
- Validation côté plateforme : valeurs ⊂ schéma déclaré, sinon rejet
  (protection SSRF/injection existante du validateur /proposer à étendre).

## 3. Schéma DB

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS params JSONB NULL;
-- NULL = abonnement broadcast (comportement v1)
-- Exemple : {"departement": "05"}
-- Unicité : (subscriber_id, source_id, params) — index unique sur
-- (subscriber_id, source_id, COALESCE(params, '{}'::jsonb))
```

`source_states` évolue : pour une source paramétrée, l'état vit **par
combinaison de paramètres** :

```sql
CREATE TABLE IF NOT EXISTS source_param_states (
  source_id TEXT REFERENCES sources(id),
  params JSONB NOT NULL,
  -- mêmes colonnes d'état que source_states (state, since, message, url,
  -- checked_at, pending_since…)
  PRIMARY KEY (source_id, params)
);
```

Le poller : pour une source interne paramétrée, `check()` reçoit la liste
des combinaisons de params **effectivement souscrites** (pas les 96
départements si 12 seulement sont suivis) et rend un état par combinaison.
La vigilance-factory est déjà prête : un appel Météo-France donne la carte
entière, on en extrait N départements pour le même coût.

`source_events` gagne une colonne `params JSONB NULL` pour l'historique.

## 4. Fusion des vigilances (le chantier pilote)

1. Créer la source unique `vigilance-meteo` (params: departement, multiple).
2. Migration des abonnements : pour chaque abonnement à
   `vigilance-meteo-XX`, créer l'abonnement `vigilance-meteo` +
   `{"departement":"XX"}`. Automatique, aucun mail, aucune action requise.
3. Les 15 sources `vigilance-meteo-XX` passent en `retired` (nouveau statut
   ou suppression douce) ; redirections `/source/vigilance-meteo-05/statut`
   → `/source/vigilance-meteo/statut?departement=05`.
4. Le kiosque affiche UNE carte « Vigilance météo » ; à l'abonnement, le
   select département est pré-rempli par `subscribers.departement`
   (personnalisation), avec « + ajouter un département » discret.

Candidats suivants, dans l'ordre : VigiEau (commune/département),
RappelConso (catégorie), DoomName (domaine — premier cas externe,
l'illustration fondatrice).

## 5. Pages de statut publiques

Une page par **source**, pas par instance : `/source/vigilance-meteo/statut`
avec un sélecteur de paramètre (défaut : département de l'utilisateur
connecté, sinon le plus suivi). Barres d'uptime et timeline filtrées par la
combinaison sélectionnée (données de `source_param_states`/`source_events`).
Le badge SVG accepte le paramètre en query string.

SEO : les pages par département restent accessibles par URL directe
(`?departement=05` rendu côté serveur) — on garde l'atout SEO sans
multiplier les pages du kiosque.

## 6. UX d'abonnement

- Carte kiosque : bouton suivre → si source paramétrée, micro-formulaire
  inline dans la carte (un select, un bouton), pré-rempli, une action.
- « Mes sources » : liste les instances avec leur libellé résolu
  (« Vigilance météo — Hautes-Alpes »), désabonnement par instance.
- Emails/push : le libellé résolu partout (objet, corps, notification).

## 7. Ce que la v2 ne fait PAS (périmètre)

- Pas de type `geo` (v2.1 — ISS, marées locales, UV localisé).
- Pas de paramètres composés/conditionnels (un schéma plat suffit).
- Pas de refonte des sources broadcast : elles ne bougent pas d'un octet.

## 8. Ordre d'exécution proposé

1. Spec : section « Sources paramétrées » dans OPENALERT.md.
2. Schéma DB + poller multi-instances (sans UI, testé sur vigilance).
3. Fusion vigilances + migration + redirections statut.
4. UI d'abonnement paramétré + Mes sources + emails/push.
5. Validateur /proposer étendu (sources externes paramétrées).
6. DoomName en source externe paramétrée (la démo qui boucle la boucle).

Chaque étape = un prompt Claude Code autonome et réversible.
