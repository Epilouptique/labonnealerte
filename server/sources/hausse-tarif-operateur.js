// Source PARAMÉTRÉE (OpenAlert v2) — PHASE 1 : détection de RÉVISION d'une grille
// tarifaire FAI (opérateur télécom). L'abonné choisit une offre ; la source signale
// factuellement qu'un CHANGEMENT a été détecté dans la grille — sans jamais lire ni
// annoncer un prix.
//
// ── Convention « Bison Futé » (INVARIANT) ────────────────────────────────────
// Le contenu du document n'est JAMAIS interprété : on hashe son TEXTE extrait
// (lib/hash-diff-pdf.js) et on compare le hash au cycle précédent. L'alerte dit
// « un changement a été détecté — à vérifier sur [lien] », JAMAIS un montant ni un
// pourcentage. Aucun flux officiel structuré n'existe chez aucun opérateur (exploration
// du 19/07/2026) : tout repose sur ce hash-diff de PDF/HTML.
//
// ── Périmètre PHASE 1 : 4 offres à URL de grille STABLE ──────────────────────
//   bbox            Bouygues Internet/Box   PDF   (UA navigateur requis, CDN sensible)
//   freebox         Free Internet/Box       HTML  (hash du NOM de fichier daté référencé)
//   free-mobile     Free Mobile             PDF   (métadonnées InDesign bruitées → texte obligatoire)
//   sfr-red-mobile  SFR RED Mobile          PDF
// L'enum `offre` est conçu pour accueillir les 4 combos de PHASE 2 (Orange mobile/box,
// SFR mobile/box classique, Bouygues mobile) sans migration lourde : ajouter une entrée
// dans OFFRES ici + une valeur dans le params_schema (init.sql), rien d'autre.
//
// ── Comportement ─────────────────────────────────────────────────────────────
// • Poll HEBDOMADAIRE (throttle par cache mémoire, TTL 7j) : les prix ne bougent pas
//   plus souvent. Le poller tourne toutes les 30 min ; on ne fetch réellement qu'une
//   fois par semaine et par offre, on rejoue le dernier résultat entre-temps.
// • requires_confirmation = FALSE (init.sql) : un changement de hash est un signal
//   discret et fort → alerte immédiate (inactive → active + notification), puis le
//   cycle suivant repasse inactive (la référence a été mise à jour) : impulsion « one-shot ».
// • Premier cycle d'une offre : le hash connu sert de RÉFÉRENCE, AUCUNE alerte.
// • Échec réseau / 403 / structure changée / pdf-parse absent : dégradation
//   silencieuse en inactive + log (jamais de fausse activation). Réessai rapproché.
// • Persistance : la référence vit en cache mémoire (comme veille-rss). Un redémarrage
//   la perd → le 1er cycle suivant ré-initialise la référence SANS alerte (direction
//   SÛRE : on peut manquer un changement survenu pendant l'arrêt, jamais en inventer un).

const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
const { hashPdf, hashText } = require('./lib/hash-diff-pdf');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // poll hebdomadaire
const RETRY_MS = 6 * 60 * 60 * 1000;     // réessai rapproché après un échec (pas d'attente d'une semaine)
const TIMEOUT_MS = 15_000;
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Catalogue des offres de PHASE 1. `kind` : 'pdf' (hash du texte extrait) ou
// 'html-filename' (hash du nom de fichier daté référencé dans une page HTML).
const OFFRES = {
  bbox: {
    label: 'Bouygues — Internet/Box',
    kind: 'pdf',
    url: 'https://www.bouyguestelecom.fr/assets/media/original/CMS/LANDING_PAGES/tarifs-conditions/rc_bbox-fit_must_ultym_p11.pdf',
    link: 'https://www.bouyguestelecom.fr/assets/media/original/CMS/LANDING_PAGES/tarifs-conditions/rc_bbox-fit_must_ultym_p11.pdf',
  },
  freebox: {
    label: 'Free — Internet/Box',
    kind: 'html-filename',
    url: 'https://adsl.free.fr/cgv/last/brochure_tarifaire.html',
    link: 'https://adsl.free.fr/cgv/last/brochure_tarifaire.html',
  },
  'free-mobile': {
    label: 'Free Mobile',
    kind: 'pdf',
    url: 'https://mobile.free.fr/docs/bt/tarifs.pdf',
    link: 'https://mobile.free.fr/docs/bt/tarifs.pdf',
  },
  'sfr-red-mobile': {
    label: 'SFR RED Mobile',
    kind: 'pdf',
    url: 'https://static.s-sfr.fr/media/bt_red.pdf',
    link: 'https://static.s-sfr.fr/media/bt_red.pdf',
  },
};
const VALID = new Set(Object.keys(OFFRES));

const paramsSchema = [
  {
    key: 'offre',
    label: 'Offre',
    type: 'enum',
    values: Object.keys(OFFRES).map((v) => ({ value: v, label: OFFRES[v].label })),
    multiple: true,
    required: true,
    default: null,
    hint: 'Choisissez l’offre à surveiller. Vous êtes prévenu qu’un changement a été détecté dans la grille tarifaire — sans montant, à vérifier vous-même sur le document officiel.',
  },
];

// Cache mémoire par offre : offre → { hash, at, ttl, result }.
//   hash : référence du dernier contenu connu (persiste, mise à jour à chaque changement) ;
//   at/ttl : throttle du fetch réel (7j en régime normal, RETRY_MS après un échec) ;
//   result : résultat rejoué entre deux fetchs réels.
const cache = new Map();

function inactive(offre) {
  const link = (OFFRES[offre] && OFFRES[offre].link) || 'https://www.labonnealerte.fr';
  return { state: 'inactive', since: null, until: null, message: null, url: link };
}

function changement(offre) {
  const o = OFFRES[offre];
  const now = new Date();
  return {
    state: 'active',
    since: now,
    until: null,
    message: `Un changement a été détecté dans la grille tarifaire ${o.label} — à vérifier sur ${o.link}`,
    url: o.link,
  };
}

// Calcule la signature { hash } de l'offre selon son type. Peut throw (réseau/format).
async function signatureOf(offre) {
  const o = OFFRES[offre];
  if (o.kind === 'pdf') {
    return await hashPdf(o.url, { timeoutMs: TIMEOUT_MS });
  }
  // html-filename : on extrait le nom de fichier PDF daté référencé dans la page et on
  // hashe CE NOM seul. Un changement de date (ex. brochure_tarifaire_20251217 →
  // _20260601) = une révision. Plus simple et plus fiable que parser le PDF (meilleur
  // signal des 4 cas). Pas d'extraction PDF ici.
  const html = await safeFetchText(o.url, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: 256 * 1024,
    accept: 'text/html',
    headers: { 'User-Agent': BROWSER_UA },
  });
  const m = html.match(/brochure_tarifaire[_-]?(\d{6,8})/i);
  if (!m) throw new Error('nom de fichier daté introuvable dans la page');
  return { hash: hashText(m[0]), extractedAt: new Date() };
}

// Décide le résultat d'une offre à partir de sa référence en cache et d'une nouvelle
// signature. Met à jour le cache. Retourne { state, ... }.
function decide(offre, prevHash, newHash) {
  if (prevHash == null) {
    // Premier cycle : la référence est mémorisée, AUCUNE alerte.
    cache.set(offre, { hash: newHash, at: Date.now(), ttl: WEEK_MS, result: inactive(offre) });
    return inactive(offre);
  }
  if (newHash !== prevHash) {
    // Changement détecté : on met à jour la référence ET on active (one-shot).
    const result = changement(offre);
    cache.set(offre, { hash: newHash, at: Date.now(), ttl: WEEK_MS, result });
    return result;
  }
  // Inchangé.
  cache.set(offre, { hash: prevHash, at: Date.now(), ttl: WEEK_MS, result: inactive(offre) });
  return inactive(offre);
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const offre = String((params && params.offre) || '');
    if (!VALID.has(offre)) { out.push(Object.assign({ params }, inactive(offre))); continue; }

    const entry = cache.get(offre);
    // Throttle : dans la fenêtre TTL, on rejoue le dernier résultat (pas de fetch réel).
    if (entry && now - entry.at < entry.ttl) {
      out.push(Object.assign({ params }, entry.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, entry ? entry.result : inactive(offre)));
      continue;
    }
    fetches += 1;

    let result;
    try {
      const sig = await signatureOf(offre);
      result = decide(offre, entry ? entry.hash : null, sig.hash);
    } catch (err) {
      // Échec (réseau/403/format/pdf-parse absent) → inactive silencieux + log.
      // On PRÉSERVE la référence connue et on programme un réessai rapproché (RETRY_MS)
      // sans attendre la semaine complète.
      console.warn(`[hausse-tarif-operateur] ${offre} : signature échouée (${err.message}) → inactive.`);
      const keptHash = entry ? entry.hash : null;
      result = inactive(offre);
      cache.set(offre, { hash: keptHash, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[hausse-tarif-operateur] ${combos.length} offres suivies, ${MAX_FETCH} vérifiées ce cycle.`);
  }
  return out;
}

module.exports = { id: 'hausse-tarif-operateur', paramsSchema, checkWithParams };
