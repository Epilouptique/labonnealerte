// scripts/check-sitemap.js
// ─────────────────────────────────────────────────────────────────────────────
// CONTRÔLE DU SITEMAP — LECTURE SEULE (aucune base, aucune écriture).
//
// Télécharge /sitemap.xml, puis interroge CHAQUE URL déclarée (requêtes HEAD, repli
// GET si le serveur refuse HEAD) et signale tout statut >= 400. Un sitemap qui
// déclare des 404 fait perdre du budget d'exploration et dégrade la confiance des
// moteurs : ce script est le garde-fou de la règle « le sitemap ne déclare que des
// pages vivantes ».
//
// Usage :
//   node scripts/check-sitemap.js                      (prod : https://labonnealerte.fr)
//   node scripts/check-sitemap.js --url=http://localhost:3000
//   node scripts/check-sitemap.js --limit=50           (échantillon, pour un test rapide)
//
// Sortie : une ligne par URL en échec + un résumé. Code de sortie 1 si au moins une
// URL répond >= 400 (utilisable en CI).
// ─────────────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const BASE = (args.url || 'https://labonnealerte.fr').replace(/\/$/, '');
const LIMIT = args.limit ? parseInt(args.limit, 10) : 0;
const CONCURRENCE = 6;

async function statut(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    // Certains serveurs ne gèrent pas HEAD : on retente en GET avant de conclure.
    if (r.status === 405 || r.status === 501) r = await fetch(url, { method: 'GET', redirect: 'manual' });
    return r.status;
  } catch (e) {
    return 'ERREUR ' + e.message;
  }
}

(async () => {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) { console.error(`sitemap.xml : HTTP ${res.status}`); process.exit(2); }
  const xml = await res.text();
  let urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]
    .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
  // Permet de contrôler un sitemap de prod contre un serveur local.
  urls = urls.map((u) => u.replace(/^https?:\/\/[^/]+/, BASE));
  if (LIMIT) urls = urls.slice(0, LIMIT);

  console.log(`── Contrôle de ${urls.length} URL déclarées dans ${BASE}/sitemap.xml ──\n`);
  const echecs = [];
  let faits = 0;
  for (let i = 0; i < urls.length; i += CONCURRENCE) {
    const lot = urls.slice(i, i + CONCURRENCE);
    const codes = await Promise.all(lot.map(statut));
    lot.forEach((u, k) => {
      const c = codes[k];
      if (typeof c !== 'number' || c >= 400) { echecs.push({ url: u, code: c }); console.log(`  ✗ ${c}  ${u}`); }
    });
    faits += lot.length;
    if (faits % 60 === 0) console.log(`    … ${faits}/${urls.length}`);
  }

  console.log(`\n${urls.length} URL contrôlées, ${echecs.length} en échec.`);
  if (echecs.length) {
    console.log('Toute URL ci-dessus doit être retirée du sitemap (ou la page rétablie).');
    process.exit(1);
  }
  console.log('VERDICT : aucune URL morte dans le sitemap.');
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(2); });
