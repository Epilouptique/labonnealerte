// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle version stable d'un paquet PHP/Composer.
// Registre public Packagist, SANS clé, sans User-Agent particulier.
//
// API : GET https://repo.packagist.org/p2/<vendor/package>.json
//   - data.packages["<vendor/package>"] = tableau de versions (récent → ancien),
//     chaque item { version, time }. On saute les branches dev et pré-releases.
// Actif si la dernière stable est sortie il y a < 72h. Cache 2h + plafond (factory).
const { createReleaseSource } = require('./lib/release-factory');

// Version stable = pas de branche dev-*, pas de suffixe alpha/beta/RC/dev.
function isStable(v) {
  const s = String(v || '');
  if (/^dev-/i.test(s)) return false;
  if (/-(?:alpha|beta|rc|dev|a|b)\b/i.test(s) || /-(?:alpha|beta|rc|dev)/i.test(s)) return false;
  return /^v?\d+\.\d+/.test(s);
}

module.exports = createReleaseSource({
  id: 'packagist-release',
  ecosystem: 'packagist',
  paramSchema: {
    key: 'paquet',
    label: 'Paquet Composer',
    placeholder: 'monolog/monolog',
    pattern: '^[a-z0-9]([a-z0-9._-]*)?/[a-z0-9]([a-z0-9._-]*)$',
    lowercase: true,
    hint: 'vendor/package sur Packagist, ex. monolog/monolog',
  },
  publicBase: (name) => 'https://packagist.org/packages/' + name,
  async fetchLatest(name, { httpGet }) {
    const path = name.split('/').map(encodeURIComponent).join('/');
    const res = await httpGet('https://repo.packagist.org/p2/' + path + '.json', { label: 'Packagist' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Réponse HTTP inattendue Packagist : ${res.status}`);
    const data = await res.json();
    const list = data && data.packages && data.packages[name];
    if (!Array.isArray(list) || list.length === 0) return null;
    const stable = list.find((v) => v && isStable(v.version));
    if (!stable || !stable.time) return null;
    const published = new Date(stable.time);
    if (Number.isNaN(published.getTime())) return null;
    return { version: stable.version, published };
  },
});
