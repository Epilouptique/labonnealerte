// scripts/rappel-conso-angle-mort-check.js — JETABLE (aucune base, aucun poller).
//
//   node scripts/rappel-conso-angle-mort-check.js
//
// Prouve, sur des libellés RÉELS récupérés de l'API RappelConso, que l'angle mort
// « asphyxie » / « dommage à la vue » est comblé sans régression anti-spam :
//   1. une fiche portant UNIQUEMENT « asphyxie » est désormais retenue (ne l'était pas) ;
//   2. une fiche portant UNIQUEMENT « dommage à la vue » est retenue (ne l'était pas) ;
//   3. aucune fiche anodine ne devient faussement grave ;
//   4. le SEUL élargissement vs l'ancienne liste = les fiches portant asphyxi/suffocation/
//      dommage à la vue (pas d'effet de bord).
// Montre aussi le nombre de fiches retenues avant/après, par catégorie, sur la fenêtre 72h.
'use strict';

const { graveLabels, GRAVE, norm } = require('../server/sources/rappel-conso.js');

const DATASET = 'rappelconso-v2-gtin-trie';
const API = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

// Rejoue EXACTEMENT la logique de graveLabels mais avec l'ANCIENNE liste (sans les 3
// ajouts du 2026-11-17) pour mesurer le « avant ». On la reconstitue en retirant les
// motifs ajoutés, reconnaissables par leur kw.
const ADDED = new Set(['asphyxi', 'suffocation', 'dommage a la vue']);
const OLD_GRAVE = GRAVE.filter((g) => !ADDED.has(g.kw));
function oldGraveLabels(row) {
  const hay = norm(row.risques_encourus) + ' ' + norm(row.motif_rappel);
  return OLD_GRAVE.filter((g) => hay.includes(g.kw)).map((g) => g.label);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

async function fetchRows(where, limit) {
  const u = new URL(API);
  u.searchParams.set('select', 'date_publication,categorie_produit,libelle,marque_produit,risques_encourus,motif_rappel,lien_vers_la_fiche_rappel');
  u.searchParams.set('where', where);
  u.searchParams.set('limit', String(limit));
  const res = await fetchFn(u.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  const j = await res.json();
  return Array.isArray(j.results) ? j.results : [];
}

(async () => {
  console.log('TEST angle mort rappel-conso (libellés réels)');

  // 1) Fiches « asphyxie seule » (risques_encourus commence par asphyxie, sans autre motif grave ancien).
  const asphyxie = await fetchRows('risques_encourus like "%asphyxie%"', 50);
  const pureAsphyxie = asphyxie.filter((r) => oldGraveLabels(r).length === 0);
  ok(pureAsphyxie.length > 0, `échantillon réel : ${pureAsphyxie.length} fiche(s) « asphyxie » invisibles à l'ancienne liste`);
  ok(pureAsphyxie.every((r) => graveLabels(r).length > 0),
    'chaque fiche « asphyxie seule » est désormais retenue (nouvelle liste)');

  // 2) Fiches « dommage à la vue seule ».
  const vue = await fetchRows('risques_encourus like "%dommage à la vue%"', 50);
  const pureVue = vue.filter((r) => oldGraveLabels(r).length === 0);
  ok(pureVue.length > 0, `échantillon réel : ${pureVue.length} fiche(s) « dommage à la vue » invisibles à l'ancienne liste`);
  ok(pureVue.every((r) => graveLabels(r).length > 0),
    'chaque fiche « dommage à la vue seule » est désormais retenue');

  // 3) Anodine : une fiche sans aucun motif grave ne doit pas le devenir.
  const anodine = { risques_encourus: 'information consommateur, qualité produit', motif_rappel: 'étiquetage à revoir, produit prévu pour mars' };
  ok(graveLabels(anodine).length === 0, 'fiche anodine (contient « revoir »/« prévu ») NON grave → pas de faux positif via « vue »');

  // 4) Pas d'effet de bord : sur un large échantillon récent, les SEULES fiches nouvellement
  //    retenues portent bien asphyxi/suffocation/dommage à la vue.
  const recent = await fetchRows('date_publication >= "2026-08-01"', 100);
  let newlyFlagged = 0, badBroadening = 0;
  for (const r of recent) {
    const before = oldGraveLabels(r).length > 0;
    const after = graveLabels(r).length > 0;
    if (after && !before) {
      newlyFlagged++;
      const hay = norm(r.risques_encourus) + ' ' + norm(r.motif_rappel);
      if (!(hay.includes('asphyxi') || hay.includes('suffocation') || hay.includes('dommage a la vue'))) badBroadening++;
    }
  }
  ok(badBroadening === 0, `aucun élargissement parasite (${newlyFlagged} fiche(s) nouvellement retenue(s), toutes légitimes)`);

  // Récap avant/après par catégorie sur les 72h (fenêtre réelle de la source).
  const sinceIso = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const win = await fetchRows(`date_publication >= "${sinceIso}"`, 100);
  const byCat = {};
  for (const r of win) {
    const c = r.categorie_produit || '(nc)';
    byCat[c] = byCat[c] || { before: 0, after: 0 };
    if (oldGraveLabels(r).length) byCat[c].before++;
    if (graveLabels(r).length) byCat[c].after++;
  }
  console.log('\nFiches GRAVES retenues sur 72h (avant → après), par catégorie :');
  Object.keys(byCat).sort().forEach((c) => {
    const b = byCat[c];
    console.log(`  ${b.before} → ${b.after}  ${c}${b.after > b.before ? '  (+' + (b.after - b.before) + ')' : ''}`);
  });
  console.log(`  (fenêtre 72h : ${win.length} fiches scannées)`);

  console.log(`\n${pass} OK, ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR réseau/test :', e.message); process.exit(1); });
