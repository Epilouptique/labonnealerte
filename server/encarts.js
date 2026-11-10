// encarts.js (serveur) — support des « encarts sympas » (encarts promotionnels maison).
//
// Deux informations sont calculées ICI (serveur) et posées en attributs sur <html> par
// pages.js, car la CSP interdit le JS inline :
//   · data-lba-encart-img : JSON { id: url } des encarts dont le VISUEL existe réellement
//     dans public/img/encarts/ (webp préféré, sinon png). Tant qu'un fichier n'existe pas,
//     son id n'y figure pas → le client affiche le dégradé de remplacement, SANS requête 404.
//     L'URL porte un paramètre de version « ?v=<mtimeMs> » basé sur la date de modification
//     du fichier : remplacer le visuel (même nom) change le paramètre → le navigateur recharge
//     la nouvelle image au lieu de servir l'ancienne depuis son cache. Aucun code à toucher.
//   · data-lba-encart-test : "1" hors production (NODE_ENV !== 'production'), sinon "0".
//     Le client n'honore ?encart=<id> (forçage d'un encart pour les captures/tests) que si
//     ce drapeau vaut "1" → aucun forçage possible en production.
'use strict';
const fs = require('fs');
const path = require('path');

const IMG_DIR = path.join(__dirname, '..', 'public', 'img', 'encarts');
// Ids connus (miroir de la liste de données client public/js/encarts.js). Sert à ne lire
// le disque que pour des noms attendus. Mettre à jour si on ajoute un encart.
const KNOWN_IDS = ['livraison-1e', 'aurores', 'echeances'];
const EXTS = ['webp', 'png']; // webp préféré

let cache = null;
// { id: '/img/encarts/<id>.<ext>' } pour chaque encart dont un fichier image existe.
function availableImages() {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  const out = {};
  for (const id of KNOWN_IDS) {
    for (const ext of EXTS) {
      try {
        // statSync sert à la fois d'existence (lève si absent) et de source du mtime : le
        // « ?v=<mtimeMs> » change dès que le fichier est remplacé → cache navigateur invalidé.
        const st = fs.statSync(path.join(IMG_DIR, id + '.' + ext));
        out[id] = '/img/encarts/' + id + '.' + ext + '?v=' + Math.floor(st.mtimeMs);
        break;
      } catch (e) { /* fichier absent : on tente l'extension suivante */ }
    }
  }
  cache = out;
  return out;
}

function testForcingEnabled() {
  return process.env.NODE_ENV !== 'production';
}

module.exports = { availableImages, testForcingEnabled, KNOWN_IDS };
