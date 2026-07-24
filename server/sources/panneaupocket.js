// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE PANNEAUPOCKET. L'abonné saisit l'URL de la page
// d'une collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…) ; la source
// alerte dès qu'un panneau NOUVEAU est publié ou qu'un panneau existant est MODIFIÉ
// (y compris s'il passe « annulé »). Cas d'usage pilote : ASA du Canal de Gap (autorisations
// d'arrosage, tours d'eau, coupures).
//
// ⚠️ CHANTIER SENSIBLE : l'URL est fournie par l'utilisateur → anti-SSRF OBLIGATOIRE via
// safeFetchText. Validation stricte EN AMONT : https, hôte EXACT app.panneaupocket.com,
// chemin /ville/…. Tout le reste est refusé (state inactive, jamais de fetch).
//
// ── SOURCE DES DONNÉES (exploration Phase 1) ─────────────────────────────────
//   La page /ville/ est rendue CÔTÉ SERVEUR (Symfony/Turbo) : les panneaux sont TOUS présents
//   dans le HTML brut, sans exécuter de JS. Pas d'endpoint JSON public ; l'/embeded ne rend
//   qu'un panneau → on parse le HTML de /ville/. Sélecteurs stables :
//     • bloc panneau  : div.sign-carousel--item[data-id="…"]
//     • ID PUBLIC     : ...?panneau=<ID> (dans l'URL de partage du bloc) — sert au lien direct
//                        ET de clé de dédup. ⚠️ ≠ data-id (interne).
//     • titre / texte : .sign-preview__content > .title / .content
//     • collectivité  : .sign-preview__title .city
//     • tampon annulé : <img src="…/sign-cancel-status/…" class="overlay">
//
// ── DÉTECTION (anti-rétroactif, jamais de faux positif) ──────────────────────
//   Référence mémorisée par URL : Map<panneauId → hash(titre + texte + état annulé)>.
//     • 1er cycle          = AMORÇAGE : on mémorise tous les couples id→hash, AUCUNE alerte.
//     • id jamais vu       → « Nouveau panneau ».
//     • id connu, hash ≠   → « Panneau mis à jour » (texte modifié ou passage « annulé »).
//     • id connu, hash =   → silence (re-sauvegarde cosmétique).
//     • id disparu         → retrait silencieux de la référence, pas d'alerte.
//   Échec réseau/parsing → inactive silencieux (jamais de fausse alerte). Cache mémoire (TTL),
//   perdu au redéploiement (dette connue : un panneau apparu pendant un arrêt peut être manqué,
//   jamais inventé).

const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
const { visibleText } = require('./lib/hash-diff-html');
const { hashText, normalizeText } = require('./lib/hash-diff-pdf');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;        // 1 Mo (page /ville/ observée ~70 Ko, marge large)
const TTL_MS = 2 * 60 * 60 * 1000;    // 2h (info périssable — ex. arrosage publié l'après-midi pour le soir ; poll ~12×/jour, reste poli)
const RETRY_MS = 60 * 60 * 1000;      // réessai 1h après un échec
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const MAX_PANNEAUX = 80;              // garde-fou (grosses collectivités)

// Validation stricte de l'URL PanneauPocket : https, hôte exact, chemin /ville/…
const HOST = 'app.panneaupocket.com';
function validPanneauUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname.toLowerCase() !== HOST) return null;
  if (!u.pathname.startsWith('/ville/')) return null;
  return u;
}

const paramsSchema = [
  {
    key: 'url',
    label: 'URL de la page PanneauPocket',
    type: 'string',
    placeholder: 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000',
    pattern: '^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Copiez l\'adresse de la page de votre collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Vous êtes prévenu à chaque nouveau panneau ou mise à jour (coupure d\'eau, arrosage, travaux…).',
  },
];

// Décodage minimal des entités HTML pour l'AFFICHAGE (titre, collectivité).
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#0*39;|&#x27;|&apos;/gi, '’')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hash d'un panneau : titre + texte visible + état annulé (jamais denoisé — un panneau n'est
// pas une horloge ; masquer les dates ferait manquer une vraie modification de créneau).
function panneauHash(titleHtml, contentHtml, cancelled) {
  const text = normalizeText(visibleText(titleHtml) + ' ' + visibleText(contentHtml));
  return hashText(text + (cancelled ? ' [ANNULE]' : ''));
}

// Parse le HTML de la page /ville/ → { city, items:[{ id, title, cancelled, hash }] }.
function parsePanneaux(html) {
  const h = String(html || '');
  const cityM = h.match(/<p class="city"[^>]*>([\s\S]*?)<\/p>/);
  const city = cityM ? decodeEntities(cityM[1]) : '';

  // Découpage par bloc panneau (positions des marqueurs sign-carousel--item).
  const marker = /<div class="sign-carousel--item[^"]*" data-id="\d+">/g;
  const positions = [];
  let m;
  while ((m = marker.exec(h))) positions.push(m.index);
  positions.push(h.length);

  const items = [];
  const seen = new Set();
  for (let i = 0; i < positions.length - 1 && items.length < MAX_PANNEAUX; i++) {
    const seg = h.slice(positions[i], positions[i + 1]);
    // ID PUBLIC = ?panneau=<id> DE CE panneau : on lit l'URL de PARTAGE du bloc
    // (facebook-share-share-url-value). ⚠️ NE PAS prendre le 1er ?panneau= du segment :
    // c'est le lien « Suivant » (id du panneau suivant) et il apparaît AVANT.
    const idM = seg.match(/facebook-share-share-url-value="[^"]*[?&]panneau=(\d+)"/)
      || seg.match(/social-share[\s\S]*?[?&]panneau=(\d+)/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const titleM = seg.match(/<div class="sign-preview__content">[\s\S]*?<div class="title">\s*([\s\S]*?)\s*<\/div>/);
    const contentM = seg.match(/<div class="content">\s*([\s\S]*?)<\/div>/);
    const cancelled = /sign-cancel-status\//.test(seg);
    const title = titleM ? decodeEntities(titleM[1]) : '(sans titre)';
    items.push({ id, title, cancelled, hash: panneauHash(titleM ? titleM[1] : '', contentM ? contentM[1] : '', cancelled) });
  }
  return { city, items };
}

function inactive(url) {
  return { state: 'inactive', since: null, until: null, message: null, url };
}

// Construit le message d'alerte agrégé (attribution « via PanneauPocket » visible).
function buildMessage(events, city, urlObj) {
  const base = `${urlObj.origin}${urlObj.pathname}`;
  const link = (id) => `${base}?panneau=${id}`;
  const who = city ? ` — ${city}` : '';
  const tag = (e) => (e.cancelled ? `« ${e.title} » (annulé)` : `« ${e.title} »`);

  if (events.length === 1) {
    const e = events[0];
    const verbe = e.kind === 'new' ? 'Nouveau panneau' : 'Panneau mis à jour';
    return `📣 ${verbe} PanneauPocket${who} : ${tag(e)}. ${link(e.id)} (via PanneauPocket)`;
  }
  const nNew = events.filter((e) => e.kind === 'new').length;
  const nUpd = events.length - nNew;
  const parts = [];
  if (nNew) parts.push(`${nNew} nouveau${nNew > 1 ? 'x' : ''}`);
  if (nUpd) parts.push(`${nUpd} mis à jour`);
  const titres = events.slice(0, 3).map(tag).join(', ') + (events.length > 3 ? '…' : '');
  // Plusieurs panneaux → lien vers la PAGE VILLE nue (sans ?panneau) pour tout voir.
  return `📣 ${events.length} panneaux PanneauPocket${who} (${parts.join(', ')}) : ${titres}. ${base} (via PanneauPocket)`;
}

// Cache par URL : { refs: Map<id, hash>, at, ttl, result }.
const cache = new Map();

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const raw = String((params && params.url) || '');
    const urlObj = validPanneauUrl(raw);
    if (!urlObj) { out.push(Object.assign({ params }, inactive('https://labonnealerte.fr'))); continue; }
    const url = urlObj.href;

    const entry = cache.get(url);
    if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(url))); continue; }
    fetches += 1;

    let result;
    try {
      const html = await safeFetchText(url, {
        timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: 'text/html',
        headers: { 'User-Agent': BROWSER_UA },
      });
      const { city, items } = parsePanneaux(html);
      const newRefs = new Map(items.map((it) => [it.id, it.hash]));

      if (!entry || !entry.refs) {
        // 1er cycle : amorçage silencieux, on mémorise tout SANS alerter.
        result = inactive(url);
      } else {
        const events = [];
        for (const it of items) {
          if (!entry.refs.has(it.id)) events.push({ ...it, kind: 'new' });
          else if (entry.refs.get(it.id) !== it.hash) events.push({ ...it, kind: 'update' });
        }
        // ids disparus : simplement absents de newRefs → retrait silencieux.
        result = events.length
          ? { state: 'active', since: new Date(), until: null, message: buildMessage(events, city, urlObj), url }
          : inactive(url);
      }
      cache.set(url, { refs: newRefs, at: now, ttl: TTL_MS, result });
    } catch (err) {
      // Réseau / parsing / SSRF bloqué / 4xx-5xx → inactive silencieux, réessai rapproché.
      // On conserve la référence existante (ne rien perdre, ne rien inventer).
      console.warn(`[panneaupocket] ${url} : ${err.message} → inactive.`);
      result = inactive(url);
      cache.set(url, { refs: entry ? entry.refs : null, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'panneaupocket', paramsSchema, checkWithParams, _parsePanneaux: parsePanneaux, _validPanneauUrl: validPanneauUrl, _buildMessage: buildMessage };
