// publish-flag.js — interrupteur d'ouverture du parcours « Publier une alerte ».
// Tant que la variable d'environnement PUBLISH_ENABLED ne vaut pas exactement "true"
// (défaut : ABSENTE = désactivé), tout le parcours de PUBLICATION est fermé :
//   - API /api/community-sources (POST/GET/PATCH/DELETE/preview/submit/report) → 404 ;
//   - pages /publier et /mes-publications → 404 ;
//   - CTA « Publier une alerte » (header, accueil, soutenir) masqués côté client.
// La LECTURE publique (kiosque, /api/sources, fiches, sitemap) et le POLLER ne changent pas.
'use strict';

function publishEnabled() {
  return String(process.env.PUBLISH_ENABLED || '').trim() === 'true';
}

module.exports = { publishEnabled };
