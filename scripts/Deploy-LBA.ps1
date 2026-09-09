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

    # CIBLE EXPLICITE, ne pas retirer. Sans -s ni -e, `railway up` deduit sa
    # destination de l'etat de liaison du CLI, qui est invisible depuis ici et
    # indexe sur le chemin EXACT du dossier (casse comprise : un `cd c:\Dev\...`
    # en minuscule suffit a le faire passer pour delie). Le projet compte QUATRE
    # services, dont deux Postgres et un au nom trompeur : verifier l'arbre au
    # fichier pres pour ensuite laisser la destination a un etat cache n'aurait
    # pas de sens.
    $service = 'labonnealerte'
    $environment = 'production'
    Push-Location $repo
    try {
        # --- Verification 1 : sommes-nous bien dans le depot attendu ? --------
        $inside = git rev-parse --is-inside-work-tree 2>$null
        if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') {
            Write-Error "DEPLOIEMENT REFUSE : $repo n'est pas un depot git."
            return
        }

        # --- Verification 2 : sommes-nous sur main ? --------------------------
        # La regle du projet est un worktree par lot. Un worktree sur une branche
        # de lot peut parfaitement avoir un arbre propre ET un HEAD pousse : tous
        # les autres controles passent, et on deploie une branche de travail en
        # production sans s'en apercevoir.
        $branch = git rev-parse --abbrev-ref HEAD
        if ($branch -ne 'main') {
            Write-Error "DEPLOIEMENT REFUSE : branche courante '$branch', attendu 'main'. Seule main va en production."
            return
        }

        # --- Verification 3 : l'arbre est-il propre ? -------------------------
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

        # --- Verification 4 : HEAD est-il synchrone avec l'amont ? ------------
        # LE FETCH N'EST PAS FACULTATIF. `@{u}` lit la reference LOCALE de suivi,
        # qui ne vaut que ce que vaut le dernier fetch. Scenario reel ici, ou
        # plusieurs sessions travaillent sur la meme machine : la session A
        # pousse ; la session B n'a pas fetche, son origin/main est perime, son
        # HEAD egale ce reference perime, le controle PASSE, et B deploie un
        # dossier qui ne contient pas le travail de A.
        # Si le fetch echoue, on REFUSE : comparer a une reference perimee
        # donnerait un feu vert qui ne prouve rien.
        git fetch --quiet 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "DEPLOIEMENT REFUSE : git fetch a echoue. Sans lui, la comparaison porterait sur une reference de suivi potentiellement perimee, et le feu vert ne prouverait rien. Retablissez le reseau."
            return
        }

        $head = git rev-parse HEAD
        $up = git rev-parse "@{u}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "DEPLOIEMENT REFUSE : aucune branche amont configuree."
            return
        }

        if ($head -ne $up) {
            # De quel cote penche l'ecart ? Le conseil n'est pas le meme, et un
            # "faites git push" donne a quelqu'un qui est EN RETARD l'envoie sur
            # une fausse piste.
            $counts = (git rev-list --left-right --count "HEAD...@{u}") -split '\s+'
            $ahead = [int]$counts[0]
            $behind = [int]$counts[1]

            if ($ahead -gt 0 -and $behind -gt 0) {
                Write-Error "DEPLOIEMENT REFUSE : branches divergentes, $ahead commit(s) en avance et $behind en retard sur l'amont. Reconciliez (git pull --rebase) avant de deployer."
            }
            elseif ($ahead -gt 0) {
                Write-Error "DEPLOIEMENT REFUSE : $ahead commit(s) en avance sur l'amont. Faites git push d'abord, sinon ce qui tourne en production sera introuvable."
            }
            else {
                Write-Error "DEPLOIEMENT REFUSE : $behind commit(s) en RETARD sur l'amont. Faites git pull -- surtout pas git push : le dossier ne contient pas le travail deja pousse par une autre session."
            }
            return
        }

        # --- Feu vert ---------------------------------------------------------
        $subject = git log -1 --pretty=%s
        Write-Host ""
        Write-Host "Arbre propre, sur main, HEAD synchrone avec l'amont." -ForegroundColor Green
        Write-Host "  Commit  : $($head.Substring(0,7))  $subject" -ForegroundColor Green
        Write-Host "  Cible   : service '$service', environnement '$environment'" -ForegroundColor Green
        Write-Host ""

        railway up -s $service -e $environment
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
