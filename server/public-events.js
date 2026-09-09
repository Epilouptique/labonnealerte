// Libelle PUBLIC d'un evenement de source.
//
// POURQUOI CE MODULE. source_events.message est un champ de DIAGNOSTIC, ecrit par le
// poller. Sur un evenement 'failed' il contient ce qui a casse, en clair :
//   « SNCF_API_KEY absente de l'environnement »        -> nom d'une variable d'environnement
//   « Timeout auth RTE (>10s) »                        -> infrastructure interne
//   « Reponse HTTP inattendue VigiEau : 404 »          -> endpoint partenaire
//   « Timeout (https://status.gandi.net/api/v2/...) »  -> URL d'un partenaire
//   « Blocage anti-bot leboncoin (IP datacenter) »     -> notre mode d'acces
// Ces messages partaient tels quels dans GET /api/sources/:id/history, accessible SANS
// COMPTE, donc lisibles par tout visiteur de /source/:id/statut.
//
// CE QUI NE CHANGE PAS : le message reste ECRIT EN BASE et reste lisible par les
// rapports du Robot 1 (scripts/veille-readonly.js interroge source_events en direct).
// On ne supprime pas l'outil de diagnostic, on cesse de le PUBLIER.
//
// LA REGLE, par type d'evenement :
//   'activated' -> message CONSERVE. C'est le contenu de l'alerte, redige pour le public
//                  et deja affiche : timeline.js en fait la citation « ... » de la frise
//                  (« Aujourd'hui : vigilance ORANGE dans Hautes-Alpes : orages »).
//                  Le retirer casserait cet affichage — verifie avant d'ecrire ce module.
//   'failed'    -> libelle GENERIQUE. L'ecran ne l'affiche pas (la frise et la timeline
//                  disent deja « Incident de surveillance » sans le message), mais on
//                  renvoie un libelle publiable plutot que null : si un ecran futur
//                  l'affiche, il affichera une phrase presentable, pas une fuite.
//   autre       -> null. 'deactivated' n'a jamais de message en pratique, et un type
//                  d'evenement AJOUTE PLUS TARD ne doit pas se publier tout seul :
//                  le defaut est de NE PAS publier, il faut venir ici pour l'ouvrir.
// Libelle ACCENTUE : c'est de l'interface, pas un message de commit. La consigne
//  sans accents  du projet ne vaut que pour git (PowerShell 5).
const PUBLIC_FAILED_LABEL = 'Source momentanément indisponible';

function publicEventMessage(event, message) {
  if (event === 'activated') return message ?? null;
  if (event === 'failed') return PUBLIC_FAILED_LABEL;
  return null;
}

module.exports = { publicEventMessage, PUBLIC_FAILED_LABEL };
