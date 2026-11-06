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
ok(/html:not\(\[data-lba-app-play="true"\]\)\s+\.appmob\s*\{\s*display:\s*none/.test(siteCss),
  'site.css : .appmob masqué tant que data-lba-app-play !== "true" (défaut = masqué)');
ok(/height:\s*auto/.test(siteCss.slice(siteCss.indexOf('.appmob-badge img'))),
  'site.css : badge en height:auto → ratio conservé (non déformé)');

// Ordre des blocs : // en chiffres  →  // sur mon smartphone  →  // pour les développeurs
const iChiffres = indexHtml.indexOf('// en chiffres');
const iSmartphone = indexHtml.indexOf('// sur mon smartphone');
const iDevs = indexHtml.indexOf('// pour les développeurs');
ok(iChiffres !== -1 && iSmartphone !== -1 && iDevs !== -1 && iChiffres < iSmartphone && iSmartphone < iDevs,
  'bloc smartphone placé ENTRE « en chiffres » et « pour les développeurs »');

// ── 3) Accueil anon : aperçu 7 (3 grandes + 4 petites), tout via ?tout=1 ──
ok(/var ANON_PREVIEW = 7\b/.test(siteJs), 'site.js : ANON_PREVIEW = 7');
ok(/anonShowAll\s*\?\s*9999\s*:\s*ANON_PREVIEW/.test(siteJs),
  'site.js : anon → 7 (aperçu) ou tout (9999) si ?tout=1');
ok(/if \(currentMode === 'connected'\) return 18;/.test(siteJs),
  'site.js : connecté → 18 en mixte (INCHANGÉ)');
ok(/tout=1/.test(siteJs), 'site.js : lecture du paramètre ?tout=1');

// La répartition mixte est pilotée par MAIN_TARGET/SIDE_TARGET (inchangés, = comportement
// connecté). On vérifie ces constantes PUIS on rejoue la formule : 7 visibles ⇒ 3 grandes / 4 petites.
ok(/MAIN_TARGET\s*=\s*7\b/.test(viewCompareJs) && /SIDE_TARGET\s*=\s*11\b/.test(viewCompareJs),
  'view-compare.js : MAIN_TARGET=7, SIDE_TARGET=11 (répartition inchangée)');
const MAIN_TARGET = 7, SIDE_TARGET = 11, TOTAL = MAIN_TARGET + SIDE_TARGET;
function mainWanted(total) {
  if (total <= 0) return 0;
  if (total >= TOTAL) return MAIN_TARGET;
  return Math.max(1, Math.round(total * MAIN_TARGET / TOTAL));
}
ok(mainWanted(7) === 3, 'répartition : 7 visibles → 3 cartes GRANDES (colonne large)');
ok(7 - mainWanted(7) === 4, 'répartition : 7 visibles → 4 cartes PETITES (colonne ultra)');
ok(mainWanted(18) === 7, 'répartition connectée : 18 visibles → 7 grandes / 11 petites (inchangé)');

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
