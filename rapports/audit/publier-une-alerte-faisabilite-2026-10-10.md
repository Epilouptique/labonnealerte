# « Publier une alerte » — audit de faisabilité (lecture seule)

**Date :** 2026-10-10 · **Nature :** audit, aucune modification, aucun déploiement.
**Bonne nouvelle :** l'ossature existe déjà (sources `external` OpenAlert + page `/proposer` + `POST /api/dev/submit-source` + validateur + sonde anti-SSRF). Ouvrir au public = durcir et outiller, pas repartir de zéro.

---

## 1) Types génériques paramétrables sans code & chemin minimal

Une source a **deux moitiés** : (a) une **ligne `sources`** (métadonnées + `params_schema`) ; (b) *éventuellement* un **module JS** `server/sources/<id>.js` (la logique `check`/`checkWithParams`). Le poller (`runCycle`) lit les lignes `sources` activées puis :
- **file-backed** (`type='internal'`) : associe la ligne à un module **par `id`** ;
- **`type='external'` + `endpoint_url`** : **aucun fichier**, l'objet source est **fabriqué à la volée** par `buildExternalSource(row)` ([server/external.js](../../server/external.js)) qui lit un **manifeste OpenAlert JSON** (`{state, since, until, message, url}`) à `endpoint_url` ; `params_schema` → une requête par combinaison (query string), plafonnée par `EXTERNAL_MAX_COMBOS` (20/cycle).

Génériques **sans code**, et leur paramètre requis :
| Type | Moteur | Paramètre requis | Déclaration |
|---|---|---|---|
| **external (OpenAlert)** | `buildExternalSource` (DB, pas de fichier) | `endpoint_url` = manifeste JSON ; `params_schema` optionnel | **ligne `sources` seule** |
| veille-rss | fichier unique | `flux` = URL https RSS/Atom (`multiple`) | ligne + module existant |
| veille-page | fichier unique | URL de page (clé dans son `paramsSchema`) | ligne + module existant |
| veille-agenda | fichier unique | URL d'agenda (ICS) | ligne + module existant |
| panneaupocket | factory `panneaupocket-veille` | `url` ville PanneauPocket | ligne + module existant |

**Chemin minimal programmatique :** `INSERT INTO sources (id, name, description, type, badge, enabled, endpoint_url, params_schema) VALUES (…, 'external', 'community', false, <manifeste>, <schema?>)`. C'est **exactement** ce que fait déjà `POST /api/dev/submit-source` (enabled=false). Aucune ligne de code serveur à écrire pour une nouvelle source `external`.

## 2) Validation d'un manifeste aujourd'hui

Dans [server/routes/dev.js](../../server/routes/dev.js), deux routes (rate-limit 10 req/min/IP) :
- **`POST /validate-manifest`** : `fetchManifest` (via `safeFetchJson` anti-SSRF) → `validateManifest` : **requis** `id`, `name`, `state∈{active,inactive,pending}`, `checked_at` ISO-8601 ; **optionnels** `since`/`until` (ISO ou null), `message`/`url` (string ou null), `params` (via `validateParamsSchema`, OpenAlert v2). Si paramétré : **sonde dynamique** — appelle l'endpoint avec `exampleParams` en query et re-valide l'échantillon.
- **`POST /submit-source`** : vérifie name/manifest_url/description, protocole http(s), `sanitizeCategories` (liste fermée 1-3), `validateParamsSchema` ; `id` = `slugify` + suffixe aléatoire anti-collision ; INSERT `type='external'`, `badge='community'`, `enabled=false`.

**Qui l'examine :** personne automatiquement. Réponse affichée : « examinée manuellement avant publication » → un humain bascule `enabled=true` à la main. **Il n'y a ni statut de cycle de vie, ni file de revue, ni lien auteur↔compte** (seulement `submitted_by_github/email` en texte libre).

## 3) Sécurité de lecture d'URL (SSRF)

**Déjà en place** ([server/safe-fetch.js](../../server/safe-fetch.js), partagé validateur + poller) :
http/https seulement · résolution DNS puis **rejet des IP privées/loopback/lien-local/ULA** (IPv4 + IPv6, y c. `::ffff:`) · **`redirect:'error'`** (pas de rebond) · **taille plafonnée** (100 Ko / 512 Ko flux, sur `content-length` ET octets réels) · **timeout** 5-6 s (AbortController) · **messages d'erreur publics** uniquement · rate-limit 10/min/IP · `EXTERNAL_MAX_COMBOS` borne les appels/cycle · `safeProbe` re-vérifie l'anti-SSRF **à chaque saut** de redirection.

**Manque pour accepter des URLs d'inconnus :**
- **DNS rebinding / TOCTOU** : on résout puis `fetch()` **re-résout** sans épingler l'IP validée → un DNS hostile peut renvoyer une IP publique au contrôle, privée au fetch. *À corriger : épingler l'IP résolue (lookup custom / agent).* **Risque n°1.**
- Plages **CGNAT `100.64.0.0/10`** non bloquées (10/172.16/192.168/127/169.254 le sont).
- Pas de **User-Agent** identifiant le robot sur `safeFetchText/Json` (seul le binaire en a un) → publishers ne peuvent pas nous reconnaître/filtrer.
- Pas de respect **robots.txt** ni de politesse par domaine (crawl-delay).
- Pas de garde **bombe de décompression** (gzip auto-décompressé avant plafond réel).
- `content-type` non imposé (on se repose sur `JSON.parse`).
- Pas de **quota par auteur/domaine** ni budget global de fetch public.

## 4) Modèle de données (ajouts minimaux, sans migration ici)

`sources` a déjà `badge (official|verified|community)`, `submitted_by_github/email`, `enabled`. À ajouter :
- **Cycle de vie** : `sources.status VARCHAR(16) DEFAULT 'draft' CHECK (status IN ('draft','testing','review','published','suspended'))` ; `published_at`, `suspended_at`, `suspended_reason TEXT`. Garder `enabled` comme interrupteur runtime **dérivé** de `status='published'`.
- **Auteur** : `sources.author_subscriber_id BIGINT REFERENCES subscribers(id)` (lie à un compte réel ; `myalerts` interroge déjà par `submitted_by_email`).
- **Badge communautaire** : déjà `badge='community'`.
- **Quotas** : *aucune table* nécessaire — dériver par `COUNT(*) … WHERE author_subscriber_id=$1 AND status IN (…)`, plafonds applicatifs (ex. 3 brouillons, 10 publiées).
- **Signalements** : cloner le mécanisme **déjà implémenté** `deck_reports` (3 `ip_hash` distincts → suspension) → `source_reports (source_id, ip_hash, reason, created_at, UNIQUE(source_id, ip_hash))` ; à 3 distincts → `status='suspended'`.
- **Journal de revue** (optionnel) : `source_review_events (source_id, actor, from_status, to_status, note, created_at)` append-only, sur le modèle de `source_events`.

## 5) Aperçu avant publication (dry-run)

**Oui, quasi acquis.** Les fonctions `check`/`checkWithParams` sont **pures** (renvoient l'état) ; toute écriture (`source_states`) et toute notification se font **plus loin**, dans `applyResult`/`processSource`. Donc un aperçu = appeler **directement** `buildExternalSource(row).check()` (ou `module.checkWithParams([params])`) **sans** passer par `processSource` → renvoie `{state, since, until, message, url}`, **zéro écriture, zéro notif**. `POST /validate-manifest` fait déjà exactement cela pour les manifestes `external` (fetch + validation + sonde d'exemple). Pour les génériques file-backed, un endpoint d'aperçu enveloppant `checkWithParams([params])` suffit.
**Effort : S.** Seul piège : **ne jamais** utiliser `processSource`/`processParamSource` (eux écrivent).

## 6) Lots, ordre, risques

**Lots :** S = aperçu/dry-run (réutilise validate-manifest + check brut) · S = colonnes `status` + `enabled` dérivé + bascule admin · M = lien auteur (login requis pour soumettre) + quotas + page « mes sources » · M = `source_reports` + auto-suspension (clone `deck_reports`) · **M/L = durcissement SSRF** (épinglage IP, UA, robots, CGNAT, gzip) · L = UI de modération / file de revue + notifications à l'auteur.

**Ordre proposé :** (1) **durcissement SSRF** (prérequis pour accepter des inconnus) → (2) `status` + aperçu → (3) auteur + quotas → (4) signalements/auto-suspension → (5) UI de modération.

**3 risques majeurs :**
1. **SSRF / DNS-rebinding** sur URLs non fiables (exposition réseau interne / métadonnées cloud) — le plus grave, bloquant tant que l'IP n'est pas épinglée.
2. **Abus & amplification de notifications** : une source publique interrogée à chaque cycle ; un manifeste malveillant qui bascule `state=active` peut spammer tous les abonnés → borner par quotas auteur + `EXTERNAL_MAX_COMBOS` + `requires_confirmation` (2 cycles) + suspension sur signalement.
3. **Contenu / modération** : `message`/`url` arbitraires (hameçonnage, contenu offensant) → **passage humain obligatoire avant `published`** et suspension rapide.
