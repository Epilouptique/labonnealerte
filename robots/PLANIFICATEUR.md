# Planificateur de tâches Windows — Robots nocturnes labonnealerte

Ce document décrit **deux** tâches planifiées, toutes deux en lecture seule :

- **Robot 1 — Veilleur de maintenance** : **quotidien** (04h00 proposé),
  `robots/robot1-veille.ps1` → rapports dans `rapports/veille/`.
- **Robot 2 — Auditeur de sécurité** : **hebdomadaire** (dimanche 03h00 proposé),
  `robots/robot2-audit.ps1` → rapports dans `rapports/audit/`.

La **première partie** ci-dessous détaille le Robot 1 ; la procédure est
identique pour le Robot 2, aux quelques valeurs près récapitulées dans la
**section « Robot 2 »** en fin de document.

---

## Robot 1 — Veilleur de maintenance (quotidien)

Cette procédure crée une tâche planifiée qui lance **chaque nuit** le veilleur de
maintenance en lecture seule (`robots/robot1-veille.ps1`). L'agent écrit son
rapport dans `rapports/veille/rapport-veille-<date>.md` et un journal
d'exécution dans `rapports/veille/run-<date>.log`.

> Rappel : ce robot est **en lecture seule**. Il ne commite rien, n'écrit qu'un
> rapport markdown, et n'exécute jamais le poller. Voir les interdits dans
> `robots/robot1-veille.prompt.md`.

Chemins de référence (à adapter si le dépôt est déplacé) :

- Dépôt : `c:\Dev\Labonnealerte`
- Script : `c:\Dev\Labonnealerte\robots\robot1-veille.ps1`

---

## Option A — Interface graphique (Planificateur de tâches)

1. Ouvrir **Planificateur de tâches** (`taskschd.msc`, ou menu Démarrer →
   « Planificateur de tâches »).
2. Panneau de droite → **Créer une tâche…** (⚠️ *pas* « Créer une tâche de
   base » : on a besoin des options avancées).

### Onglet « Général »
- **Nom** : `LBA - Robot1 Veille nocturne`
- **Description** : `Veille de maintenance labonnealerte (lecture seule) - rapport markdown quotidien.`
- Cocher **« Exécuter même si l'utilisateur n'est pas connecté »** → la tâche
  tourne **session verrouillée**.
- Cocher **« Exécuter avec les autorisations maximales »** (confort ; le script
  ne requiert pas l'admin mais évite les surprises de droits sur le dossier).
- **Configurer pour** : Windows 10 / Windows 11.

### Onglet « Déclencheurs » → Nouveau…
- **Lancer la tâche** : `Selon une planification`
- **Paramètres** : `Quotidien`, tous les `1` jours.
- **Heure de début** : `04:00:00` (proposé — machine allumée, hors cycle poller).
- Laisser **« Activé »** coché. OK.

### Onglet « Actions » → Nouvelle…
- **Action** : `Démarrer un programme`
- **Programme/script** :
  ```
  powershell.exe
  ```
- **Ajouter des arguments (facultatif)** :
  ```
  -ExecutionPolicy Bypass -File "c:\Dev\Labonnealerte\robots\robot1-veille.ps1"
  ```
- **Commencer dans (facultatif)** — le champ « Démarrer dans » :
  ```
  c:\Dev\Labonnealerte
  ```
  (Le script fait aussi un `Set-Location`, mais renseigner ce champ est la bonne
  pratique.)

### Onglet « Conditions »
- **Décocher** « Ne démarrer la tâche que si l'ordinateur est relié au secteur »
  si la machine est un portable qui doit veiller sur batterie (sinon laisser).
- **Décocher** **« Sortir l'ordinateur du mode veille pour exécuter cette tâche »**
  → on **ne réveille pas** la machine (si elle dort à 04:00, la tâche est
  simplement sautée ; elle repartira la nuit suivante).

### Onglet « Paramètres »
- Cocher **« Exécuter la tâche dès que possible après un démarrage planifié
  manqué »** (rattrape une nuit où la machine était éteinte).
- **Arrêter la tâche si elle s'exécute plus de** : `1 heure` (garde-fou).
- Valider par **OK**. Windows demandera le **mot de passe** du compte (nécessaire
  pour « exécuter même déconnecté »).

---

## Option B — Ligne de commande (PowerShell, en admin)

À exécuter dans une console PowerShell **lancée en administrateur**, ligne par
ligne (PowerShell 5, pas de `&&`) :

```powershell
$Action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -File "c:\Dev\Labonnealerte\robots\robot1-veille.ps1"' -WorkingDirectory 'c:\Dev\Labonnealerte'
$Trigger   = New-ScheduledTaskTrigger -Daily -At 04:00
$Settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun:$false -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'LBA - Robot1 Veille nocturne' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Veille de maintenance labonnealerte (lecture seule).' -RunLevel Highest -User $env:USERNAME
```

> Pour « exécuter même déconnecté » via script, il faut fournir les identifiants :
> ajouter `-LogonType S4U` (ou `-LogonType Password` avec `-User` + mot de passe).
> `-WakeToRun:$false` = ne pas réveiller la machine. `-StartWhenAvailable` =
> rattraper une exécution manquée.

---

## Tester la tâche manuellement

1. Dans le Planificateur : **Bibliothèque du planificateur** → clic droit sur
   `LBA - Robot1 Veille nocturne` → **Exécuter**.
2. Ou en PowerShell :
   ```powershell
   Start-ScheduledTask -TaskName 'LBA - Robot1 Veille nocturne'
   ```
3. Vérifier ensuite l'onglet **Historique** de la tâche et surtout le **log**
   (voir ci-dessous). Un premier essai peut aussi se faire **hors planificateur**,
   directement :
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File "c:\Dev\Labonnealerte\robots\robot1-veille.ps1"
   ```

---

## Où lire le résultat

Tout est déposé dans `c:\Dev\Labonnealerte\rapports\veille\` :

- **Rapport de veille** (écrit par l'agent, à lire en priorité) :
  `rapport-veille-<AAAA-MM-JJ>.md`
- **Journal d'exécution** (stdout + stderr de `claude`, pour diagnostiquer si le
  rapport manque) : `run-<AAAA-MM-JJ>.log`

Le **code retour** de `claude` est propagé par le script ; l'onglet
**Historique** de la tâche indique un dernier résultat `0x0` en cas de succès.

---

## Dépannage rapide

- **Rien ne se passe / code ≠ 0** : ouvrir `run-<date>.log`. Une erreur
  `claude : terme non reconnu` = la CLI `claude` n'est pas dans le `PATH` du
  compte qui exécute la tâche → mettre le chemin complet de `claude` dans le
  `.ps1`, ou lancer la tâche sous le compte utilisateur qui a installé Claude Code.
- **Prompt introuvable** : le log contient `ERREUR : prompt introuvable` →
  vérifier `$RepoDir` en tête de `robots/robot1-veille.ps1`.
- **La tâche ne part jamais à 04:00** : la machine était en veille/éteinte et
  « réveil » est (volontairement) désactivé → l'exécution manquée est rattrapée
  au prochain démarrage grâce à `StartWhenAvailable`.

---

## Robot 2 — Auditeur de sécurité (hebdomadaire)

Même principe que le Robot 1, en lecture seule (revue de sécurité du dépôt
local : dépendances, routes, patterns SSRF/injection, secrets). L'agent écrit
son rapport dans `rapports/audit/rapport-audit-<date>.md` et un journal dans
`rapports/audit/run-<date>.log`. Interdits détaillés :
`robots/robot2-audit.prompt.md`.

> Ce robot ne fait **aucune requête vers labonnealerte.fr** ni aucun scan
> réseau. Seul accès externe : le registre npm, pour `npm audit`.

Chemins de référence :

- Dépôt : `c:\Dev\Labonnealerte`
- Script : `c:\Dev\Labonnealerte\robots\robot2-audit.ps1`

Reprends **exactement** la procédure du Robot 1 (Option A ou B ci-dessus), en
changeant seulement ces valeurs :

| Champ | Valeur Robot 2 |
|---|---|
| **Nom de la tâche** | `LBA - Robot2 Audit securite hebdo` |
| **Description** | `Audit securite labonnealerte (lecture seule, depot local) - rapport hebdomadaire.` |
| **Déclencheur** | `Hebdomadaire`, tous les `1` semaines, jour **Dimanche** |
| **Heure de début** | `03:00:00` (proposé — creux, distinct du Robot 1 à 04h00) |
| **Programme/script** | `powershell.exe` |
| **Arguments** | `-ExecutionPolicy Bypass -File "c:\Dev\Labonnealerte\robots\robot2-audit.ps1"` |
| **Commencer dans** | `c:\Dev\Labonnealerte` |

Onglets « Conditions » et « Paramètres » : réglages **identiques** au Robot 1
(ne pas réveiller la machine `WakeToRun:$false`, rattraper une exécution manquée
`StartWhenAvailable`, garde-fou 1 heure).

### Option B — PowerShell (en admin), équivalent Robot 2

```powershell
$Action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -File "c:\Dev\Labonnealerte\robots\robot2-audit.ps1"' -WorkingDirectory 'c:\Dev\Labonnealerte'
$Trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 03:00
$Settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun:$false -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'LBA - Robot2 Audit securite hebdo' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Audit securite labonnealerte (lecture seule, depot local).' -RunLevel Highest -User $env:USERNAME
```

**Tester** / **lire le résultat** / **dépanner** : identique au Robot 1, en
remplaçant `veille` par `audit` dans les chemins et
`LBA - Robot1 Veille nocturne` par `LBA - Robot2 Audit securite hebdo`.
