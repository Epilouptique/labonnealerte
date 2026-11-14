# Visuels des encarts sympas (encarts.js).
# Fichiers attendus : <id>.webp (préféré) ou <id>.png — ids : livraison-1e, aurores, echeances.
# PORTRAIT, largeur 600 px, hauteur libre par visuel (chaque encart garde sa hauteur naturelle).
# Actuellement : livraison-1e 600x915, aurores 600x1030, echeances 600x1151. Poids conseillé : <= 120 Ko.
# Le ratio est fixé PAR ENCART dans public/css/site.css (.encart[data-encart-id="..."] .encart-media)
# pour réserver la hauteur AVANT chargement (pas de clignotement). Si tu changes une hauteur, ajuste ce ratio.
# originaux/ : sauvegarde des anciens visuels (600x960) — NON détectée par le serveur (sous-dossier).
# Tant qu'un fichier est absent, l'encart affiche un dégradé de remplacement (aucune requête 404).
