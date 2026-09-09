# Deploy-LBA - garde-fou de deploiement pour La Bonne Alerte.
#
# POURQUOI CE SCRIPT EXISTE. `railway up` expedie le CONTENU DU DOSSIER, pas le
# HEAD git. Un arbre de travail sale envoie donc en production du code non
# commite : c'est arrive trois fois. Ce script refuse de deployer tant que ce
# qui partira n'est pas exactement ce qui est commite et pousse.
#
# CE QU'IL NE FAIT DELIBEREMENT PAS :
#   - pas de `git stash` automatique. Remiser le travail d'autrui sans le lui
#     dire est pire que de refuser : le contenu disparait de l'ecran de celui
#     qui l'a ecrit, et personne ne sait qu'il existe encore.
#   - aucune option pour passer outre. S'il refuse, la reponse est de commiter,
#     de remiser soi-meme ou d'ignorer - jamais de contourner le garde-fou.
#   - il ne distingue pas ce qui est "a moi" de ce qui ne l'est pas : il bloque
#     sur TOUT, y compris le travail en cours d'une autre session.
#
# Installation : dot-sourcer depuis le profil PowerShell.
#   . C:\Dev\Labonnealerte\scripts\Deploy-LBA.ps1

function Deploy-LBA {
    [CmdletBinding()]
    param()

    $repo = 'C:\Dev\Labonnealerte'
    Push-Location $repo
    try {
        # --- Verification 1 : sommes-nous bien dans le depot attendu ? --------
        $inside = git rev-parse --is-inside-work-tree 2>$null
        if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') {
            Write-Error "DEPLOIEMENT REFUSE : $repo n'est pas un depot git."
            return
        }

        # --- Verification 2 : l'arbre est-il propre ? -------------------------
        # --porcelain couvre l'index, les modifications ET les fichiers non
        # suivis : c'est exactement le perimetre de ce que railway up expedie.
        # On separe les deux categories parce qu'elles ne se resolvent pas
        # pareil : un fichier modifie se commite ou se remise, un fichier non
        # suivi s'ajoute ou s'ignore.
        $porcelain = @(git status --porcelain)
        if ($porcelain.Count -gt 0) {
            $untracked = @($porcelain | Where-Object { $_.StartsWith('??') })
            $modified  = @($porcelain | Where-Object { -not $_.StartsWith('??') })

            Write-Host ""
            Write-Host "ARBRE SALE - ceci partirait en production :" -ForegroundColor Yellow

            if ($modified.Count -gt 0) {
                Write-Host ""
                Write-Host "  Fichiers modifies ou indexes ($($modified.Count)) :" -ForegroundColor Yellow
                foreach ($f in $modified) { Write-Host "      $f" }
                Write-Host "  -> a commiter, ou a remiser vous-meme (git stash)." -ForegroundColor DarkGray
            }

            if ($untracked.Count -gt 0) {
                Write-Host ""
                Write-Host "  Fichiers non suivis ($($untracked.Count)) :" -ForegroundColor Yellow
                foreach ($f in $untracked) { Write-Host "      $f" }
                Write-Host "  -> a ajouter au depot, ou a inscrire dans .gitignore." -ForegroundColor DarkGray
            }

            Write-Host ""
            Write-Error "DEPLOIEMENT REFUSE : l'arbre de travail n'est pas propre. Ces fichiers peuvent appartenir a une autre session : ne les remisez pas sans le demander."
            return
        }

        # --- Verification 3 : HEAD est-il pousse ? ----------------------------
        # Un HEAD en avance sur l'amont deploierait du code que personne d'autre
        # n'a. Ce n'est pas un risque pour la production, mais c'en est un pour
        # la reproductibilite : impossible de retrouver ensuite ce qui tourne.
        $head = git rev-parse HEAD
        $up = git rev-parse "@{u}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "DEPLOIEMENT REFUSE : aucune branche amont configuree."
            return
        }
        if ($head -ne $up) {
            Write-Error "DEPLOIEMENT REFUSE : HEAD ($($head.Substring(0,7))) differe de l'amont ($($up.Substring(0,7))). Faites git push d'abord."
            return
        }

        # --- Feu vert ---------------------------------------------------------
        $subject = git log -1 --pretty=%s
        Write-Host ""
        Write-Host "Arbre propre, HEAD pousse. Deploiement de $($head.Substring(0,7)) :" -ForegroundColor Green
        Write-Host "    $subject" -ForegroundColor Green
        Write-Host ""

        railway up
        if ($LASTEXITCODE -ne 0) {
            Write-Error "railway up a echoue (code $LASTEXITCODE)."
            return
        }
        Write-Host "Deploiement termine." -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
