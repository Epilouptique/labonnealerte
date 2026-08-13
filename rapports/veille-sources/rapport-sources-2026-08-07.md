# Rapport de veille — nouvelles pistes de sources
**Date :** 2026-08-07  
**Robot :** 4 — Veilleur de nouvelles sources (lecture seule + recherche web)

---

## Introduction

2 pistes ce cycle. Recensement anti-doublon préalable réalisé sur ~240 fichiers `server/sources/*.js` et croisé avec la liste des sources écartées de `.claude/etat-projet.md`.

---

## Piste 1 — Plan Vigipirate : niveau d'alerte antiterroriste national

**Nom :** Plan Vigipirate — posture nationale  
**URL de référence :** https://www.sgdsn.gouv.fr/vigipirate

### Accès

Page publique du SGDSN (Secrétariat Général de la Défense et de la Sécurité Nationale). Aucun API JSON identifié dans les résultats de recherche : ni endpoint documenté sur api.gouv.fr, ni dataservice sur data.gouv.fr, ni mention de flux structuré dans la documentation SGDSN consultée. L'accès constaté est HTML uniquement.

Pas de robots.txt examiné directement (hors périmètre de ce robot). Pas de mention de rate-limit ni de conditions de licence particulières pour la consultation de la page publique. La page /vigipirate du SGDSN est publique et référencée par info.gouv.fr.

### Format de réponse constaté

HTML uniquement. Le niveau actuel est présenté en clair sur la page. Aucune structure JSON ou XML n'a été identifiée dans les résultats de recherche. La valeur du niveau (ex. « vigilance renforcée ») figure dans le texte de la page et dans les titres des communiqués de presse publiés sur le même domaine (ex. `sgdsn.gouv.fr/publications/posture-vigipirate-…`).

Si une vérification directe de la page est effectuée, le niveau réel du contenu HTML (balises, classes CSS portant la valeur du niveau) ne peut pas être confirmé par ce robot sans fetch direct.

### Fréquence de mise à jour apparente

Changements de posture saisonniers (environ 2 fois par an : posture hiver-printemps, posture été-automne) et ponctuels en cas d'événement (attentat, menace imminente). La posture en cours au 2026-08-07 est « vigilance renforcée » (posture été-automne 2026, entrée en vigueur le 22 juin 2026, première à appliquer le plan VIGIPIRATE 2026 révisé). La posture précédente (hiver-printemps 2026) était au niveau « urgence attentat ».

Trois niveaux possibles depuis la révision 2026 du plan :
1. vigilance
2. vigilance renforcée
3. urgence attentat (activable pour 12 jours renouvelables par décision expresse du Premier ministre)

### Repères internes

Structure de détection d'état comparable à `cert-fr-alertes.js` (état de menace nationale, changements rares mais à fort impact) ou à `vigilance-meteo.js` (valeur d'alerte nationale publiée par une autorité publique, scraping de page officielle). La fréquence de changement (quelques fois par an en rythme normal) est proche de `ecogaz.js` ou `risque-secheresse.js` (état qui reste stable plusieurs semaines).

---

## Piste 2 — API Géorisques : risques hors catastrophes naturelles

**Nom :** API Géorisques (BRGM / Ministère de la Transition écologique)  
**URL de référence :** https://www.georisques.gouv.fr / https://www.data.gouv.fr/dataservices/api-georisques

### Accès

L'API Géorisques est documentée sur ecologie.data.gouv.fr et data.gouv.fr. L'accès est conditionné à un **jeton d'authentification via le service Cerbère** (portail d'authentification du BRGM / Ministère). Les résultats de recherche mentionnent explicitement un token et le service Cerbère pour l'accès aux endpoints v2. Pas de taux de limitation publiquement documenté dans les résultats consultés. Licence : service public français, conditions non précisées dans les résultats.

La version non authentifiée (si elle existe) n'a pas pu être confirmée ou infirmée sans fetch direct.

### Format de réponse constaté

JSON selon la documentation referencée sur data.gouv.fr (endpoints REST v2). Les endpoints couvrent : catastrophes naturelles (arrêtés CatNat), ICPE (installations classées pour la protection de l'environnement, dont Seveso), PPRn (plans de prévention des risques naturels), zonage sismique, radon, mouvements de terrain, inondations TRI (territoires à risque d'inondation important). La structure réelle des réponses JSON n'a pas été vérifiée directement (voir accès conditionné ci-dessus).

### Fréquence de mise à jour apparente

Variable selon le type de données :
- Arrêtés CatNat : mis à jour à chaque parution au Journal Officiel (plusieurs fois par mois).
- ICPE / PPRn / TRI / radon : données réglementaires dont la fréquence de mise à jour n'a pas été précisée dans les résultats consultés ; par nature, ces données évoluent peu (modifications réglementaires, nouvelles autorisations, révisions de plans).

### Repères internes

L'endpoint CatNat de l'API Géorisques est de même nature que `catnat-commune.js` déjà en production (arrêtés de catastrophes naturelles par commune INSEE). Les autres endpoints (ICPE, PPRn, TRI, radon) exposent des données de nature différente — catalogue de risques réglementaires statiques — sans équivalent direct en production. Aucune source existante ne couvre les installations Seveso ou le zonage radon.

**Ce robot ne peut pas confirmer si les endpoints hors-CatNat exposent des données dynamiques** (nouvelles autorisations ICPE publiées en temps quasi-réel, mises à jour de PPRn, etc.) **ou uniquement un référentiel figé**. Cette distinction est déterminante pour l'usage en alerte ; elle nécessite une vérification directe de l'API avec un jeton Cerbère.

---

## Doublons évités

| Piste examinée | Raison de l'écart |
|---|---|
| Hub'Eau Piézométrie (nappes phréatiques) | Explicitement écartée dans `.claude/etat-projet.md` (section ÉCARTÉES documentées : « nappes »). |
| AlerteCyber / cybermalveillance.gouv.fr | Explicitement écartée dans `.claude/etat-projet.md` : doublon démontré de `cert-fr-alertes` avec 3-8 j de retard, aucun flux structuré. |
| Eaux de baignade (Hub'Eau / baignades.sante.gouv.fr) | Piste reportée dans `.claude/etat-projet.md` (section PISTE REPORTÉE 29/07) : aucune source nationale ouverte constatée, SISE-Baignades non en open data, consigne de ne pas retenter sans signal nouveau. |
| Hub'Eau Qualité des nappes d'eau souterraine | Même famille que nappes piézométrie (données souterraines Hub'Eau), et données de qualité chimique = référentiel réglementaire non dynamique du point de vue alerte. |
