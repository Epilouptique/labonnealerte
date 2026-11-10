# Visuels des encarts sympas (encarts.js).
# Fichiers attendus : <id>.webp (préféré) ou <id>.png — ids : livraison-1e, aurores, echeances.
# PORTRAIT, ratio UNIQUE 3/5 : 600x1000 px pour les trois. Poids conseillé : <= 120 Ko.
# Le ratio 3/5 est posé sur .encart-media dans public/css/site.css (AVANT chargement → la boîte
# réserve sa taille, pas de clignotement). Garde les visuels en 600x1000 (ou même ratio 3/5).
# Le serveur (server/encarts.js) ajoute ?v=<mtime> à l'URL : remplacer un fichier (même nom)
# invalide le cache navigateur tout seul, aucun code à toucher.
# originaux/ : sauvegarde des anciens visuels — NON détectée par le serveur (sous-dossier).
# Tant qu'un fichier est absent, l'encart affiche un dégradé de remplacement (aucune requête 404).
