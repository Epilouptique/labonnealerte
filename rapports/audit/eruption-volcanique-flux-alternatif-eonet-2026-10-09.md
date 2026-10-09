# eruption-volcanique — flux alternatif officiel (NASA EONET)

**Date :** 2026-10-09 · **Statut :** PROPOSITION, non déployée, aucune écriture base.

## Problème

La source `eruption-volcanique` lit le Weekly Volcanic Activity Report du Smithsonian GVP
(`https://volcano.si.edu/news/WeeklyVolcanoRSS.xml`). Le WAF du GVP renvoie **403 depuis début
octobre 2026**. Le code actuel [eruption-volcanique.js](../../server/sources/eruption-volcanique.js)
**présente déjà un User-Agent de navigateur** (`Mozilla/5.0 … Chrome/120`, ligne 26) pour passer
le WAF — exactement le contournement que l'on ne veut plus — et il ne passe plus de toute façon.

Contrainte posée : **aucun contournement du pare-feu, aucun changement d'identité de navigateur.**
Les autres points d'accès GVP (KML `WeeklyVolcanoGE.kml`, CAP, WFS GeoServer) sont sur le **même
host** `volcano.si.edu` → mêmes 403 à prévoir. Il faut un autre host officiel.

## Flux retenu : NASA EONET (Earth Observatory Natural Event Tracker)

`GET https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open`

- **Officiel** : opéré par NASA (Earth Science Data Systems Program / Earth Observatory).
- **Ouvert** : JSON, sans clé, sans WAF ; testé le 2026-10-09 avec un `fetch` standard **sans
  User-Agent de navigateur** → 200 OK.
- **Mondial** et **source Smithsonian GVP** : chaque événement cite `"sources":[{"id":"SIVolcano",
  "url":"https://volcano.si.edu/volcano.cfm?vn=…"}]` → même origine de donnée que le flux bloqué.

### Exemple de réponse RÉELLE (capturée le 2026-10-09, extrait)

```json
{
  "title": "EONET Events",
  "events": [
    {
      "id": "EONET_20710",
      "title": "Nevados del Chillan Volcano, Chile",
      "closed": null,
      "categories": [{ "id": "volcanoes", "title": "Volcanoes" }],
      "sources": [{ "id": "SIVolcano", "url": "https://volcano.si.edu/volcano.cfm?vn=357070" }],
      "geometry": [{ "date": "2026-06-15T00:00:00Z", "type": "Point", "coordinates": [-71.378, -36.868] }]
    },
    {
      "id": "EONET_20409",
      "title": "Telica Volcano, Nicaragua",
      "sources": [{ "id": "SIVolcano", "url": "https://volcano.si.edu/volcano.cfm?vn=344040" }],
      "geometry": [{ "date": "2026-05-30T00:00:00Z", "type": "Point", "coordinates": [-86.84, 12.606] }]
    }
  ]
}
```

### Conditions d'utilisation / licence

- **Données** : produites par une agence fédérale américaine (NASA) → **domaine public**, libres de
  réutilisation ; attribution demandée par courtoisie (« NASA EONET », et la source citée Smithsonian GVP).
- **Disclaimer EONET (à assumer explicitement)** : *« All EONET metadata and services are intended
  to be used for visualization and general information purposes only and should not be construed as
  "official" with regards to spatial or temporal extent »* — donc **informatif, non opérationnel**.
  C'est **cohérent** avec cette source, dont le message indique déjà « pas du temps réel ». Mais
  c'est un choix à valider : EONET ne se présente pas comme un service d'alerte.
- Pas de clé API ni de limite de débit documentée (appel hebdomadaire côté poller → charge nulle).

## Implémentation proposée (NON déployée)

Même structure que l'actuel (anti-rétroactif par Set, dédoublonnage par clé), mais : clé = `event.id`,
libellé = `event.title`, date = dernière `geometry.date`, URL = `sources[0].url`. **Sur erreur
réseau/HTTP non-ok/timeout : on PROPAGE (throw)** — jamais `inactive` — conformément à la politique
du commit 42643a8. Esquisse :

```js
const FEED_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open';
// fetch SANS User-Agent de navigateur, SANS en-tête Accept trafiqué.
// if (!res.ok) throw new Error('EONET HTTP ' + res.status);   // → incident, pas inactive
// parse json.events[] (catégorie 'volcanoes'), clé = id, libellé = title,
// date = max(geometry[].date), url = sources[0].url || link.
// 1er passage : seed seen, inactive. Ensuite : ids inédits → active ; message « information ».
```

Code complet testable dans [scripts/test-eruption-eonet-proposal.js](../../scripts/test-eruption-eonet-proposal.js).

## Test (en mémoire, réponse réelle rejouée, non déployé)

`node scripts/test-eruption-eonet-proposal.js` — **5 tests verts** : parse de la réponse réelle,
amorçage anti-rétroactif (inactive), passage stable (inactive), nouvel événement → active avec
libellé + URL officielle `volcano.si.edu`, corps vide → inactive (une vraie erreur réseau, elle,
serait propagée en amont, pas avalée).

## Recommandation

**Adopter EONET** : seul flux officiel, ouvert, mondial, sans spoof, avec la même origine de donnée
(Smithsonian GVP). Réserve honnête : NASA qualifie EONET d'informatif, « non officiel » — acceptable
ici car la source est déjà explicitement informationnelle et hebdomadaire, mais **à valider par Hugo**.
Si ce caractère non-officiel est rédhibitoire, l'alternative est la **désactivation propre** de la
source (champ d'activation, jamais de DELETE, message utilisateur honnête) — je fournirai le script
`--check` à la demande. **Rien n'est déployé avant accord.**
