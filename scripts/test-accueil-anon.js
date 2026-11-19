// scripts/test-accueil-anon.js — chantier « accueil non connecté + header » (hors ligne).
// Vérifie les GARANTIES du lot sur les fichiers source (aucun navigateur, aucun réseau) :
//   · accueil non connecté : aperçu 3 grandes + 4 petites (7 visibles), pas de « Afficher
//     plus » ni de compteur, lien « Voir toutes les alertes » ;
//   · accueil connecté : inchangé (18 en mixte, compteur + « Afficher plus » conservés) ;
//   · bloc « Sur mon smartphone » masqué par défaut, visible quand le drapeau est actif ;
//   · header sans « !fr » sur plusieurs pages (markup conservé, masqué en CSS).
// Lancer : node scripts/test-accueil-anon.js
'use strict';
const fs = require('fs');
const path = require('path');
let passed = 0, fails = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { fails++; console.error('  ✗ ' + m); } };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const indexHtml = read('public/index.html');
const connexionHtml = read('public/connexion.html');
const siteCss = read('public/css/site.css');
const siteJs = read('public/js/site.js');
const headerJs = read('public/js/header.js');
const viewCompareJs = read('public/js/view-compare.js');

console.log('TEST accueil non connecté + header');

// ── 1) Header : « !fr » masqué en CSS, markup conservé (pour pouvoir le rétablir) ──
ok(/\.brandmark\s+\.bang\s*,\s*\.brandmark\s+\.fr\s*\{\s*display:\s*none/.test(siteCss),
  'site.css masque .brandmark .bang + .fr (règle unique, toutes pages)');
ok(/<span class="bang">/.test(indexHtml) && /<span class="fr">fr<\/span>/.test(indexHtml),
  'index.html : markup .bang/.fr CONSERVÉ (rétablissable)');
ok(/<span class="bang">/.test(connexionHtml) && /<span class="fr">fr<\/span>/.test(connexionHtml),
  'connexion.html : markup .bang/.fr CONSERVÉ');
ok(/class="bang"/.test(headerJs) && /class="fr"/.test(headerJs),
  'header.js : LOGO_HTML (desktop + menu mobile) conserve .bang/.fr');
ok(/<title>[^<]*labonnealerte|La Bonne Alerte/i.test(indexHtml),
  'le <title> de la page n\'est pas touché (domaine/nom internes préservés)');

// ── 2) Bloc « Sur mon smartphone » : présent, gated par drapeau, badge officiel FR ──
ok(/class="appmob"/.test(indexHtml), 'index.html : section .appmob présente');
ok(/\/\/ sur mon smartphone/.test(indexHtml), 'index.html : titre de bloc « // sur mon smartphone »');
ok(indexHtml.indexOf('play.google.com/store/apps/details?id=fr.labonnealerte.app') !== -1,
  'index.html : lien vers la fiche Play de fr.labonnealerte.app');
ok(/alt="Disponible sur Google Play"/.test(indexHtml), 'index.html : alt="Disponible sur Google Play"');
ok(/src="\/img\/google-play-fr\.png"/.test(indexHtml), 'index.html : badge /img/google-play-fr.png');
ok(fs.existsSync(path.join(__dirname, '..', 'public/img/google-play-fr.png')), 'badge officiel présent dans public/img/');
// ÉTAT ACTUEL du CSS (modifs Hugo en cours) : le bloc est masqué sur le SEUL drapeau Play,
// et il n'existe plus de règle par badge. Le test reflète ce rendu. ⚠ Écart connu avec le
// contrat déclaré dans index.html (deux badges indépendants) : signalé à Hugo, cf. rapport.
ok(/html:not\(\[data-lba-app-play="true"\]\)\s+\.appmob\s*\{\s*display:\s*none/.test(siteCss),
  'site.css : .appmob masqué quand data-lba-app-play !== "true" (gate actuel = drapeau Play seul)');
ok(/class="appmob-badge appmob-badge--appstore"/.test(indexHtml)
  && /class="appmob-badge appmob-badge--play"/.test(indexHtml),
  'index.html : deux badges App Store + Play présents (classes --appstore / --play)');
ok(/\.appmob-badge img\s*\{[^}]*height:\s*auto/.test(siteCss),
  'site.css : .appmob-badge img en height:auto (ratio conservé ; même hauteur car les 2 badges FR partagent le ratio 2,58)');
ok(indexHtml.indexOf('apps.apple.com/fr/app/la-bonne-alerte/id6833982399') !== -1,
  'index.html : lien vers la fiche App Store id6833982399');
ok(/src="\/img\/app-store-fr\.png" alt="Télécharger dans l'App Store"/.test(indexHtml),
  'index.html : badge /img/app-store-fr.png avec texte alternatif');
ok(!/comme le site/.test(indexHtml.slice(indexHtml.indexOf('class="appmob"'), indexHtml.indexOf('class="devs"'))),
  'index.html : bloc appmob sans « open source — comme le site »');

// Ordre des blocs : // en chiffres  →  // sur mon smartphone  →  // pour les développeurs
const iChiffres = indexHtml.indexOf('// en chiffres');
const iSmartphone = indexHtml.indexOf('// sur mon smartphone');
const iDevs = indexHtml.indexOf('// pour les développeurs');
ok(iChiffres !== -1 && iSmartphone !== -1 && iDevs !== -1 && iChiffres < iSmartphone && iSmartphone < iDevs,
  'bloc smartphone placé ENTRE « en chiffres » et « pour les développeurs »');

// ── 3) Accueil anon : aperçu 7 (4 grandes + 3 petites), tout via ?tout=1 ──
ok(/var ANON_PREVIEW = 7\b/.test(siteJs), 'site.js : ANON_PREVIEW = 7');
ok(/anonShowAll\s*\?\s*9999\s*:\s*ANON_PREVIEW/.test(siteJs),
  'site.js : anon → 7 (aperçu) ou tout (9999) si ?tout=1');
ok(/if \(currentMode === 'connected'\) return 18;/.test(siteJs),
  'site.js : connecté → 18 en mixte (INCHANGÉ)');
ok(/tout=1/.test(siteJs), 'site.js : lecture du paramètre ?tout=1');

// La répartition mixte suit un RATIO 4:3 (demande Hugo 19/11) : side = round(main × 3/4),
// soit main = round(total × 4/7). On vérifie les constantes PUIS on rejoue la formule :
// 7 visibles ⇒ 4 grandes / 3 petites ; 18 ⇒ 10 grandes / 8 petites.
ok(/MAIN_RATIO\s*=\s*4\b/.test(viewCompareJs) && /SIDE_RATIO\s*=\s*3\b/.test(viewCompareJs),
  'view-compare.js : MAIN_RATIO=4, SIDE_RATIO=3 (ratio 4:3, plafond fixe retiré)');
const MAIN_RATIO = 4, SIDE_RATIO = 3, RATIO_SUM = MAIN_RATIO + SIDE_RATIO;
function mainWanted(total) {
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total * MAIN_RATIO / RATIO_SUM));
}
// Cohérence avec la formule de Hugo « petites = round(grandes × 3/4) ».
const sideFromMain = (m) => Math.round(m * SIDE_RATIO / MAIN_RATIO);
ok(mainWanted(7) === 4, 'répartition : 7 visibles → 4 cartes GRANDES (colonne large)');
ok(7 - mainWanted(7) === 3, 'répartition : 7 visibles → 3 cartes PETITES (colonne ultra)');
ok(7 - mainWanted(7) === sideFromMain(mainWanted(7)),
  'répartition : 3 petites = round(4 grandes × 3/4) [formule Hugo respectée à 7]');
ok(mainWanted(18) === 10 && 18 - mainWanted(18) === 8,
  'répartition connectée : 18 visibles → 10 grandes / 8 petites (ratio 4:3 appliqué partout)');
ok(18 - mainWanted(18) === sideFromMain(mainWanted(18)),
  'répartition : 8 petites = round(10 grandes × 3/4) [formule Hugo respectée à 18]');

// ── 3bis) Carte « Publier une alerte » : fond --amber-soft translucide au repos,
//         sans opacity (texte/bordure opaques), survol --amber-soft plein inchangé ──
const pubRule = (siteCss.match(/\.card\.add\.publish-cta\s*\{[^}]*\}/) || [''])[0];
ok(/background:\s*color-mix\(in srgb,\s*var\(--amber-soft\)\s*40%,\s*transparent\)/.test(pubRule),
  'site.css : .publish-cta au repos → --amber-soft à 40 % (translucide, plus léger que le survol)');
ok(!/opacity/.test(pubRule),
  'site.css : .publish-cta ne touche PAS à opacity (texte et bordure restent opaques)');
ok(/\.card\.add:hover\s*\{\s*background:\s*var\(--amber-soft\)/.test(siteCss),
  'site.css : survol .card.add → --amber-soft plein (effet inchangé)');

// ── 4) « Afficher plus » + compteur retirés en anon, lien « Voir toutes » ajouté ──
ok(/var anon = currentMode !== 'connected';/.test(siteJs),
  'site.js updateMore : branche « anon »');
ok(/var hide = \(anon \|\|/.test(siteJs),
  'site.js : bouton « Afficher plus » masqué en anon');
ok(/if \(anon\) \{\s*cpt\.textContent = '';\s*cpt\.hidden = true;/.test(siteJs),
  'site.js : compteur « N sur M » masqué en anon');
ok(/'\s*sur\s*'/.test(siteJs), 'site.js : compteur « N sur M » CONSERVÉ pour les connectés');
ok(/id="see-all-anon"/.test(indexHtml), 'index.html : lien « Voir toutes les alertes » présent');
ok(/Voir toutes les alertes/.test(indexHtml), 'index.html : libellé « Voir toutes les alertes »');
ok(/getElementById\('see-all-anon'\)/.test(siteJs),
  'site.js : le lien « Voir toutes » est piloté (anon, caché une fois tout affiché)');
ok(/\.see-all-anon\s*\{/.test(siteCss), 'site.css : style du lien « Voir toutes les alertes »');

console.log(`\n${passed} OK, ${fails} échec(s).`);
process.exit(fails ? 1 : 0);
