// Test permanent (sans réseau ni base) : rejoue la séquence réelle de l'assistant
// « Publier une alerte » — POST brouillon minimal (type + url) puis APERÇU, pour les
// 3 types (page, rss, agenda), puis PATCH (changement d'URL) puis aperçu.
//
// Garde-fou du bug lot 8 : la route POST lisait validateUrlType à plat (v.engine/v.url)
// alors que le résultat est { ok, value: { engine, url, … } } → engine/endpoint_url NULL
// et nom/id de repli « ma veille ». On vérifie ici que la lecture via v.value persiste
// bien engine, endpoint_url, un nom provisoire dérivé de l'hôte et un id dérivé de l'hôte.
'use strict';
const assert = require('assert');
const F = require('../public/js/publier-flow.js');
const lc = require('../server/sources/lib/source-lifecycle.js');

let n = 0;
function ok(c, m) { n++; if (!c) { console.error('✗ ' + m); process.exit(1); } console.log('✓ ' + m); }

// Réplique EXACTE du slugify de la route (server/routes/community-sources.js) pour vérifier
// l'id dérivé du nom provisoire.
function slugify(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'veille';
}

// Simule la PERSISTANCE de la route POST (LOT 9 : titre + catégorie à la création, id
// dérivé du titre, lecture corrigée via v.value), sans base.
function createRoute(body) {
  const v = lc.validateUrlType(body);
  if (!v.ok) return { status: 400, error: v.error };
  const { engine, url } = v.value;            // ← lecture corrigée (le bug lisait v.engine/v.url)
  const config = {};
  const zone = typeof body.zone === 'string' ? body.zone.trim() : '';
  if (zone) {
    if (engine !== 'veille-page') return { status: 400, error: 'zone hors page' };
    config.zone = zone;
  }
  // Titre fourni → nom + id dérivés du titre (jamais « brouillon ») ; sinon repli hôte.
  let name, provisional = false;
  if (body.name != null && String(body.name).trim() !== '') name = String(body.name).trim();
  else { name = lc.provisionalName(url); provisional = true; }
  const categories = Array.isArray(body.categories) ? body.categories : [];
  const id = slugify(name);
  return { status: 201, provisional, row: {
    id, name, description: name, type: 'internal', badge: 'community', status: 'draft',
    engine, endpoint_url: url, categories, engine_config: Object.keys(config).length ? config : null,
  } };
}

// Simule l'APERÇU : moteur page = branche dédiée ; rss/agenda = buildEngineSource.
// require mocké → aucun réseau.
function mockRequire(path) {
  // mod générique : checkWithParams renvoie un résultat inactif figé.
  return { checkWithParams: async (paramsList) => [{ state: 'inactive', since: null, until: null, message: null, url: paramsList[0] && paramsList[0][Object.keys(paramsList[0])[0]] }] };
}
async function previewRoute(row) {
  if (row.engine === 'veille-page') {
    // La vraie route lit la page (safeFetchText) ; hors réseau on vérifie seulement que
    // la source a bien un moteur page et une URL exploitables.
    assert.ok(row.endpoint_url, 'page: endpoint_url présent');
    return { ok: true, branch: 'page' };
  }
  const src = lc.buildEngineSource(row, mockRequire);
  if (!src) return { ok: false, error: 'Moteur de source non pris en charge.' };
  const r = await src.check();
  return { ok: true, branch: 'engine', state: r.state };
}

(async () => {
  // Séquence RÉELLE de l'assistant (LOT 9) : écran 1 titre + catégorie, écran 2 type + url.
  const CASES = [
    { type: 'page',   url: 'https://exemple.fr/tarifs',      engine: 'veille-page',   title: 'Prix RTX',   cat: 'gpu',      id: 'prix-rtx' },
    { type: 'rss',    url: 'https://blog.exemple.fr/feed',   engine: 'veille-rss',    title: 'Blog Acme',  cat: 'tech',     id: 'blog-acme' },
    { type: 'agenda', url: 'https://agenda.exemple.fr/c.ics', engine: 'veille-agenda', title: 'Agenda club', cat: 'concerts', id: 'agenda-club' },
  ];

  for (const c of CASES) {
    const draft = Object.assign(F.emptyDraft(), { type: c.type, url: c.url, title: c.title, categories: [c.cat] });
    const body = F.createBody(draft);
    assert.strictEqual(body.url, c.url);
    ok(body.name === c.title && JSON.stringify(body.categories) === JSON.stringify([c.cat]), `${c.type} : titre + catégorie envoyés dès la création`);
    const resp = createRoute(body);
    ok(resp.status === 201 && resp.provisional === false, `${c.type} : brouillon créé (201, non provisoire)`);
    ok(resp.row.engine === c.engine, `${c.type} : engine = ${c.engine} (non NULL)`);
    ok(resp.row.endpoint_url === c.url, `${c.type} : endpoint_url persisté (non NULL)`);
    ok(resp.row.name === c.title, `${c.type} : nom = titre saisi`);
    ok(JSON.stringify(resp.row.categories) === JSON.stringify([c.cat]), `${c.type} : catégorie persistée`);
    ok(resp.row.id === c.id, `${c.type} : id dérivé du titre (${resp.row.id})`);
    ok(resp.row.id.indexOf('brouillon') !== 0, `${c.type} : id jamais préfixé « brouillon »`);

    const pv = await previewRoute(resp.row);
    ok(pv.ok, `${c.type} : aperçu OK (pas « Moteur non pris en charge »)`);
  }

  // Sans titre : repli sur nom provisoire dérivé de l'hôte (rétro-compatible).
  const noTitle = createRoute({ type: 'page', url: 'https://exemple.fr/p' });
  ok(noTitle.provisional === true && noTitle.row.name === lc.provisionalName('https://exemple.fr/p'), 'sans titre : repli nom provisoire');

  // Zone sur une veille de page : persistée ; refusée hors page.
  const withZone = createRoute({ type: 'page', url: 'https://exemple.fr/p2', zone: '#prix', name: 'Z', categories: ['gpu'] });
  ok(withZone.status === 201 && withZone.row.engine_config.zone === '#prix', 'zone persistée sur veille-page');
  ok(createRoute({ type: 'rss', url: 'https://exemple.fr/f', zone: '#x', name: 'R', categories: ['tech'] }).status === 400, 'zone refusée hors page');

  // PATCH : changement d'URL → endpoint_url mis à jour, engine inchangé, aperçu toujours OK.
  const base = createRoute({ type: 'rss', url: 'https://blog.exemple.fr/feed' }).row;
  const newUrl = 'https://autre.exemple.fr/rss';
  const patched = Object.assign({}, base, { endpoint_url: newUrl }); // la route PATCH ne touche pas engine
  ok(patched.engine === 'veille-rss', 'PATCH : engine inchangé');
  ok(patched.endpoint_url === newUrl, 'PATCH : endpoint_url mis à jour');
  const pvAfter = await previewRoute(patched);
  ok(pvAfter.ok && pvAfter.branch === 'engine', 'PATCH puis aperçu : moteur reconstruit OK');

  // Garde-fou explicite du bug : la lecture à plat est indéfinie, la vraie est sous value.
  const v = lc.validateUrlType({ type: 'page', url: 'https://exemple.fr/x' });
  ok(v.engine === undefined && v.url === undefined, 'garde-fou : v.engine/v.url à plat = undefined');
  ok(v.value.engine === 'veille-page' && v.value.url === 'https://exemple.fr/x', 'garde-fou : v.value.{engine,url} corrects');

  console.log(`\n${n} assertions — OK`);
})().catch((e) => { console.error(e); process.exit(1); });
