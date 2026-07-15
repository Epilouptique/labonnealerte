# robot4-veille-sources.ps1
# =============================================================================
# Robot 4 - Veilleur de nouvelles sources (LECTURE SEULE + recherche web,
# hebdomadaire). Lance l'agent Claude Code en mode non-interactif (-p) avec le
# prompt robots/robot4-veille-sources.prompt.md. L'agent ecrit lui-meme son
# rapport markdown dans rapports/veille-sources/ ; ce script ne fait que
# l'orchestration + journalisation.
#
# PARTICULARITE : seul des quatre robots a avoir besoin d'ACCES WEB SORTANT
# pendant l'execution headless (recherche de nouveautes). Si l'acces web est
# bloque pour une session -p, l'agent doit le CONSTATER dans son rapport (pas de
# contournement a deviner).
#
# Compatible Windows PowerShell 5.1 (pas de && ni d'operateurs ternaires).
# Prevu pour le Planificateur de taches Windows (voir robots/PLANIFICATEUR.md).
# =============================================================================

# --- Chemin du depot (SEUL parametre a ajuster si le depot est deplace) ------
$RepoDir = 'c:\Dev\Labonnealerte'

# --- Emplacements derives ----------------------------------------------------
$PromptFile = Join-Path $RepoDir 'robots\robot4-veille-sources.prompt.md'
$ReportDir  = Join-Path $RepoDir 'rapports\veille-sources'
$Stamp      = Get-Date -Format 'yyyy-MM-dd'
$LogFile    = Join-Path $ReportDir ("run-$Stamp.log")

# On se place dans le depot : le prompt reference des chemins relatifs
# (server/sources/*.js, README.md, .claude/etat-projet.md...).
Set-Location -Path $RepoDir

# Cree rapports/veille-sources/ si absent (le rapport y sera ecrit par l'agent).
if (-not (Test-Path -LiteralPath $ReportDir)) {
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

# Le prompt est indispensable : on echoue proprement s'il manque.
if (-not (Test-Path -LiteralPath $PromptFile)) {
    "[$(Get-Date -Format s)] ERREUR : prompt introuvable : $PromptFile" |
        Out-File -FilePath $LogFile -Encoding utf8 -Append
    exit 1
}

# --- Lancement de l'agent ----------------------------------------------------
# Passage du prompt via STDIN (redirection) : robuste pour un gros prompt
# multi-ligne sous Windows. Meme moule que robot1-veille.ps1 / robot2-audit.ps1.
#   -p / --print                     : mode non-interactif (une reponse, pas de REPL)
#   --dangerously-skip-permissions   : pas de prompt de permission (tache planifiee)
# stdout ET stderr sont rediriges vers le log (distinct du rapport markdown).
#
# NB acces web : ce robot a besoin de WebSearch/WebFetch pendant la session -p.
# Si l'environnement Claude Code de la machine bloque le web en mode headless,
# l'agent le constatera dans son rapport (RAS web => pistes non verifiables).

"[$(Get-Date -Format s)] Demarrage veille sources (repo=$RepoDir)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

Get-Content -LiteralPath $PromptFile -Raw |
    claude -p --dangerously-skip-permissions *>> $LogFile

# Code retour de claude (propage a la tache planifiee).
$ExitCode = $LASTEXITCODE

"[$(Get-Date -Format s)] Fin veille sources (exit=$ExitCode)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

exit $ExitCode
