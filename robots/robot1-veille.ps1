# robot1-veille.ps1
# =============================================================================
# Robot 1 - Veilleur de maintenance (LECTURE SEULE).
# Lance l'agent Claude Code en mode non-interactif (-p) avec le prompt
# robots/robot1-veille.prompt.md. L'agent ecrit lui-meme son rapport markdown
# dans rapports/veille/ ; ce script ne fait que l'orchestration + journalisation.
#
# Compatible Windows PowerShell 5.1 (pas de && ni d'operateurs ternaires).
# Prevu pour le Planificateur de taches Windows (voir robots/PLANIFICATEUR.md).
# =============================================================================

# --- Chemin du depot (SEUL parametre a ajuster si le depot est deplace) ------
$RepoDir = 'c:\Dev\Labonnealerte'

# --- Emplacements derives ----------------------------------------------------
$PromptFile = Join-Path $RepoDir 'robots\robot1-veille.prompt.md'
$ReportDir  = Join-Path $RepoDir 'rapports\veille'
$Stamp      = Get-Date -Format 'yyyy-MM-dd'
$LogFile    = Join-Path $ReportDir ("run-$Stamp.log")

# On se place dans le depot : le prompt reference des chemins relatifs
# (scripts/veille-readonly.js, server/sources/*.js...).
Set-Location -Path $RepoDir

# Cree rapports/veille/ si absent (le rapport markdown y sera ecrit par l'agent).
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
# multi-ligne sous Windows (pas de limite de longueur d'argument, pas de
# probleme d'echappement de guillemets). Teste OK avec "claude -p".
#   -p / --print                     : mode non-interactif (une reponse, pas de REPL)
#   --dangerously-skip-permissions   : pas de prompt de permission (tache planifiee)
# stdout ET stderr sont rediriges vers le log (distinct du rapport markdown).
#
# Get-Content -Raw lit le prompt en une seule chaine ; le pipe l'envoie sur
# l'entree standard de claude.

"[$(Get-Date -Format s)] Demarrage veille (repo=$RepoDir)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

Get-Content -LiteralPath $PromptFile -Raw |
    claude -p --dangerously-skip-permissions *>> $LogFile

# Code retour de claude (propage a la tache planifiee).
$ExitCode = $LASTEXITCODE

"[$(Get-Date -Format s)] Fin veille (exit=$ExitCode)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

exit $ExitCode
