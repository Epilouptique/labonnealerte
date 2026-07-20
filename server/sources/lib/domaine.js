// Utilitaires PARTAGÉS des cartes « domaine » (domaine-disponibilite &
// domaine-securite) : une seule vérité pour la validation/normalisation du nom de
// domaine saisi par l'utilisateur, afin de garder une UX cohérente entre les cartes.

// Nom de domaine simple (au moins un point), sans schéma ni chemin.
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
// Même motif au format chaîne pour les paramsSchema / init.sql (backslash échappé).
const DOMAIN_PATTERN = '^[a-z0-9-]+(\\.[a-z0-9-]+)+$';

// Normalise un domaine saisi : minuscules, sans schéma, sans chemin, sans port.
function normalizeDomain(raw) {
  return String(raw || '')
    .trim().toLowerCase()
    .replace(/^https?:\/\//, '') // au cas où l'abonné colle un schéma
    .replace(/\/.*$/, '')        // retire tout chemin
    .replace(/:\d+$/, '');       // retire un port éventuel
}

// Horodatage court en fuseau de Paris, pour les messages « détecté le … ».
function horodatage(d) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(d);
}

module.exports = { DOMAIN_RE, DOMAIN_PATTERN, normalizeDomain, horodatage };
