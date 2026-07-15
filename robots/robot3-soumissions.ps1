# robot3-soumissions.ps1
# =============================================================================
# Robot 3 - Trieur de soumissions dev (LECTURE SEULE).
#
# LIGNE ROUGE : ce robot RAPPORTE, il ne DECIDE JAMAIS. Il ne touche a AUCUNE
# colonne de la table sources, JAMAIS a `enabled`. Aucun UPDATE/INSERT/DELETE
# nulle part. Sa seule sortie est un rapport markdown ; Hugo passe enabled=true
# a la main apres lecture. Aucune automatisation de cette bascule, meme future.
#
# DORMANT : construit maintenant, active MANUELLEMENT au lancement public. Pas
# de tache planifiee tant que /proposer n'a pas de trafic reel (voir
# robots/PLANIFICATEUR.md). Ce script est testable a la demande des aujourd'hui.
#
# Lance l'agent Claude Code en mode non-interactif (-p) avec le prompt
# robots/robot3-soumissions.prompt.md. L'agent ecrit lui-meme son rapport dans
# rapports/soumissions/ ; ce script ne fait que l'orchestration + journalisation.
#
# Compatible Windows PowerShell 5.1 (pas de && ni d'operateurs ternaires).
# =============================================================================

# --- Chemin du depot (SEUL parametre a ajuster si le depot est deplace) ------
$RepoDir = 'c:\Dev\Labonnealerte'

# --- Emplacements derives ----------------------------------------------------
$PromptFile = Join-Path $RepoDir 'robots\robot3-soumissions.prompt.md'
$ReportDir  = Join-Path $RepoDir 'rapports\soumissions'
$Stamp      = Get-Date -Format 'yyyy-MM-dd'
$LogFile    = Join-Path $ReportDir ("run-$Stamp.log")

# On se place dans le depot : le prompt reference des chemins relatifs
# (scripts/soumissions-readonly.js, server/safe-fetch.js, server/routes/dev.js).
Set-Location -Path $RepoDir

# Cree rapports/soumissions/ si absent (le rapport y sera ecrit par l'agent).
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
# multi-ligne sous Windows. Meme moule que robot1/robot2/robot4.
#   -p / --print                     : mode non-interactif (une reponse, pas de REPL)
#   --dangerously-skip-permissions   : pas de prompt de permission
# stdout ET stderr sont rediriges vers le log (distinct du rapport markdown).

"[$(Get-Date -Format s)] Demarrage tri soumissions (repo=$RepoDir)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

Get-Content -LiteralPath $PromptFile -Raw |
    claude -p --dangerously-skip-permissions *>> $LogFile

# Code retour de claude (propage a l'appelant).
$ExitCode = $LASTEXITCODE

"[$(Get-Date -Format s)] Fin tri soumissions (exit=$ExitCode)" |
    Out-File -FilePath $LogFile -Encoding utf8 -Append

exit $ExitCode
