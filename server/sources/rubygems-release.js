// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle version d'une gem Ruby.
// Registre public RubyGems, SANS clé, sans User-Agent particulier.
//
// API : GET https://rubygems.org/api/v1/gems/<gem>.json
//   - data.version = dernière version STABLE ; data.version_created_at = date ISO.
// (RubyGems renvoie déjà la dernière stable sur cette route.)
// Actif si sortie il y a < 72h. Cache 2h + plafond (factory).
const { createReleaseSource } = require('./lib/release-factory');

module.exports = createReleaseSource({
  id: 'rubygems-release',
  ecosystem: 'rubygems',
  paramSchema: {
    key: 'gem',
    label: 'Gem Ruby',
    placeholder: 'rails',
    pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$',
    lowercase: false, // les noms de gem sont sensibles à la casse
    hint: 'nom de la gem sur RubyGems, ex. rails ou devise',
  },
  publicBase: (name) => 'https://rubygems.org/gems/' + name,
  async fetchLatest(name, { httpGet }) {
    const res = await httpGet('https://rubygems.org/api/v1/gems/' + encodeURIComponent(name) + '.json', { label: 'RubyGems' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Réponse HTTP inattendue RubyGems : ${res.status}`);
    const data = await res.json();
    const version = data && data.version;
    const published = data && data.version_created_at ? new Date(data.version_created_at) : null;
    if (!version || !published || Number.isNaN(published.getTime())) return null;
    return { version, published };
  },
});
