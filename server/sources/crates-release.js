// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle version stable d'un crate Rust.
// Registre public crates.io, SANS clé — mais User-Agent descriptif OBLIGATOIRE
// (crates.io renvoie 403 sinon ; politique documentée + ~1 req/s).
//
// API : GET https://crates.io/api/v1/crates/<crate>
//   - data.crate.max_stable_version = dernière version STABLE (ignore les pré-releases) ;
//   - data.versions[] (récent → ancien), chaque item { num, created_at } → date de publi.
// Actif si la dernière stable est sortie il y a < 72h. Cache 2h + plafond (factory).
const { createReleaseSource } = require('./lib/release-factory');

const UA = 'Labonnealerte/1.0 (+https://labonnealerte.fr; dahu.concept@gmail.com)';

module.exports = createReleaseSource({
  id: 'crates-release',
  ecosystem: 'crates',
  paramSchema: {
    key: 'crate',
    label: 'Crate Rust',
    placeholder: 'serde',
    pattern: '^[a-z0-9][a-z0-9._-]{0,63}$',
    lowercase: true,
    hint: 'nom du crate sur crates.io, ex. serde ou tokio',
  },
  publicBase: (name) => 'https://crates.io/crates/' + name,
  async fetchLatest(name, { httpGet }) {
    const res = await httpGet('https://crates.io/api/v1/crates/' + encodeURIComponent(name), {
      headers: { 'User-Agent': UA }, label: 'crates.io',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Réponse HTTP inattendue crates.io : ${res.status}`);
    const data = await res.json();
    const crate = data && data.crate;
    const version = crate && (crate.max_stable_version || crate.newest_version);
    if (!version || !Array.isArray(data.versions)) return null;
    const match = data.versions.find((v) => v && v.num === version) || data.versions[0];
    const published = match && match.created_at ? new Date(match.created_at) : null;
    if (!published || Number.isNaN(published.getTime())) return null;
    return { version, published };
  },
});
