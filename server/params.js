// OpenAlert v2 — helpers de paramètres partagés (routes + poller).
// Schéma = tableau plat de descripteurs { key, label, type, values, multiple, required }.
// v2 : un abonnement porte un objet plat, ex { "departement": "05" }.
//
// Type 'commune' (vague ville) : la valeur CANONIQUE stockée est un CODE INSEE. Le nom de
// ville saisi/pré-rempli est résolu en INSEE À LA SOUSCRIPTION (route, via
// lib/commune-insee) AVANT validateParams — ici on ne valide donc qu'un code INSEE.

const { isInsee, nameForInsee, isEncodedCoords, decodeCoords } = require('./sources/lib/commune-insee');

// Valide un objet params brut contre le schéma. Retourne { ok, params } canonique
// (clés ⊂ schéma, valeurs contrôlées) ou { ok:false, error }.
function validateParams(schema, raw) {
  if (!Array.isArray(schema) || schema.length === 0) return { ok: false, error: 'source non paramétrée' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'params invalide' };

  const out = {};
  for (const desc of schema) {
    const v = raw[desc.key];
    if (v == null || v === '') {
      if (desc.required) return { ok: false, error: `paramètre requis : ${desc.key}` };
      continue;
    }
    if (desc.type === 'enum') {
      const allowed = Array.isArray(desc.values) ? desc.values.map((x) => String(x.value)) : [];
      if (!allowed.includes(String(v))) return { ok: false, error: `valeur non autorisée pour ${desc.key}` };
      out[desc.key] = String(v);
    } else if (desc.type === 'commune') {
      // Valeur canonique = code INSEE (la résolution nom→INSEE a lieu dans la route).
      const s = String(v).trim().toUpperCase();
      if (!isInsee(s)) return { ok: false, error: `code INSEE attendu pour ${desc.key}` };
      out[desc.key] = s;
    } else if (desc.type === 'commune-coords') {
      // Valeur canonique = "lat|lon|nom" (la résolution nom→coords a lieu dans la route).
      const s = String(v).trim();
      if (!isEncodedCoords(s)) return { ok: false, error: `coordonnées attendues pour ${desc.key}` };
      out[desc.key] = s;
    } else if (desc.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) return { ok: false, error: `nombre attendu pour ${desc.key}` };
      if (typeof desc.min === 'number' && n < desc.min) return { ok: false, error: `${desc.key} < min` };
      if (typeof desc.max === 'number' && n > desc.max) return { ok: false, error: `${desc.key} > max` };
      out[desc.key] = n;
    } else { // string ET dynamic-enum (valeur libre : la liste d'options est côté front/lookup ;
      // ici on valide le FORMAT via pattern — pour dynamic-enum, ce pattern est le contrat
      // validPanneauUrl exprimé en regex, donc toute valeur hors /ville/ est rejetée).
      // Plafond de longueur : 120 par défaut (inchangé pour toutes les sources
      // existantes). `maxLength` permet à un schéma INTERNE (init.sql) de le
      // relever quand la valeur légitime est plus longue — cas des adresses
      // iCal d'agenda, qui dépassent systématiquement 120 caractères. Sans ce
      // réglage, l'URL serait tronquée EN SILENCE, passerait quand même le
      // `pattern`, et l'abonnement serait définitivement muet.
      const cap = (typeof desc.maxLength === 'number' && desc.maxLength > 0)
        ? Math.min(desc.maxLength, 500) : 120;
      let s = String(v).trim().slice(0, cap);
      if (desc.lowercase) s = s.toLowerCase();
      // `pattern` n'est honoré que pour les schémas internes de confiance (init.sql) :
      // validateParamsSchema le retire des schémas soumis (anti-ReDoS).
      if (desc.pattern) {
        let re = null;
        try { re = new RegExp(desc.pattern, 'i'); } catch (e) { re = null; }
        if (re && !re.test(s)) return { ok: false, error: `format invalide pour ${desc.key}` };
      }
      if (!s) return { ok: false, error: `valeur vide pour ${desc.key}` };
      out[desc.key] = s;
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'aucun paramètre fourni' };
  return { ok: true, params: out };
}

// Petits mots (minuscule) et sigles (majuscule) pour la dérivation de libellé dynamic-enum.
const DYN_SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'et', 'en', 'sur', 'aux', 'a', 'au', 'l', 'sous']);
const DYN_ACRONYMS = new Set(['asa', 'sivom', 'sivu', 'sdis', 'cc', 'ca', 'cu', 'epci', 'cciv', 'sie', 'siaep']);

// dynamic-enum (ex. ma-collectivite) : la valeur canonique STOCKÉE est une URL PanneauPocket
// /ville/<id>-<slug>-<cp>. On en DÉRIVE un libellé lisible (jamais l'URL brute) — même esprit
// que commune→nom : valeur canonique en entrée, libellé humain en sortie, SANS stockage.
// Ex. …/ville/398423648-asa-du-canal-de-gap-05000 → « ASA du Canal de Gap (05000) ».
function labelFromDynamicValue(raw) {
  const s = String(raw || '').trim();
  let slug = s;
  try { slug = (new URL(s).pathname.split('/').filter(Boolean).pop()) || ''; }
  catch (e) { /* pas une URL : on retombe sur la valeur telle quelle */ }
  if (!slug) return s;
  slug = slug.replace(/^\d+-/, '');            // retire l'id numérique de tête
  let cp = '';
  const m = slug.match(/-(\d{5})$/);           // code postal en fin de slug → entre parenthèses
  if (m) { cp = m[1]; slug = slug.slice(0, -m[0].length); }
  const words = slug.split('-').filter(Boolean).map((w, i) => {
    const low = w.toLowerCase();
    if (DYN_ACRONYMS.has(low)) return w.toUpperCase();
    if (i > 0 && DYN_SMALL_WORDS.has(low)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  });
  let label = words.join(' ').trim();
  if (!label) return cp || s;
  if (cp) label += ' (' + cp + ')';
  return label;
}

// « Hautes-Alpes » à partir de { departement:'05' } et du schéma enum.
function resolveLabel(schema, params) {
  if (!Array.isArray(schema) || !params) return '';
  const parts = [];
  for (const desc of schema) {
    const v = params[desc.key];
    if (v == null) continue;
    let label = String(v);
    if (desc.type === 'enum' && Array.isArray(desc.values)) {
      const found = desc.values.find((x) => String(x.value) === String(v));
      if (found) label = found.label;
    } else if (desc.type === 'commune') {
      // Affiche le nom de commune si connu (cache INSEE→nom), sinon le code INSEE.
      label = nameForInsee(v) || String(v);
    } else if (desc.type === 'commune-coords') {
      const d = decodeCoords(v);
      label = d ? d.nom : String(v);
    } else if (desc.type === 'dynamic-enum') {
      // Libellé lisible dérivé de l'URL canonique (jamais l'URL brute dans les chips/statut/emails).
      label = labelFromDynamicValue(v);
    }
    parts.push(label);
  }
  return parts.join(', ');
}

// Objet params depuis une query string (?departement=05), filtré + validé au schéma.
function paramsFromQuery(schema, query) {
  if (!Array.isArray(schema) || !query) return null;
  const raw = {};
  for (const desc of schema) {
    if (query[desc.key] != null) raw[desc.key] = query[desc.key];
  }
  const res = validateParams(schema, raw);
  return res.ok ? res.params : null;
}

const PARAM_TYPES = ['enum', 'string', 'number', 'commune', 'commune-coords', 'dynamic-enum'];

// Valide un SCHÉMA de paramètres déclaré (manifeste externe ou interne).
// v2 : schéma PLAT à UN SEUL paramètre (§7). Retourne { ok, error, schema }.
function validateParamsSchema(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'params doit être un tableau de descripteurs' };
  if (raw.length !== 1) return { ok: false, error: 'la v2 accepte exactement un paramètre (schéma plat)' };
  const d = raw[0];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'descripteur de paramètre invalide' };
  if (typeof d.key !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(d.key)) {
    return { ok: false, error: 'key : identifiant alphanumérique requis (ex. "departement")' };
  }
  if (typeof d.label !== 'string' || !d.label.trim()) return { ok: false, error: 'label : chaîne non vide requise' };
  if (!PARAM_TYPES.includes(d.type)) return { ok: false, error: `type : l'un de ${PARAM_TYPES.join(' | ')}` };
  if (d.type === 'enum') {
    if (!Array.isArray(d.values) || d.values.length === 0) {
      return { ok: false, error: 'enum : "values" non vide requis' };
    }
    for (const v of d.values) {
      if (!v || typeof v !== 'object' || v.value == null || v.value === '' || typeof v.label !== 'string' || !v.label) {
        return { ok: false, error: 'chaque valeur enum doit avoir un "value" et un "label"' };
      }
    }
    const seen = new Set();
    for (const v of d.values) {
      const key = String(v.value);
      if (seen.has(key)) return { ok: false, error: `valeur enum dupliquée : ${key}` };
      seen.add(key);
    }
  }
  if (d.multiple !== undefined && typeof d.multiple !== 'boolean') return { ok: false, error: 'multiple : booléen' };
  if (d.required !== undefined && typeof d.required !== 'boolean') return { ok: false, error: 'required : booléen' };
  // Normalisation minimale.
  const schema = [{
    key: d.key, label: d.label, type: d.type,
    values: d.type === 'enum' ? d.values.map((v) => ({ value: v.value, label: v.label })) : undefined,
    multiple: !!d.multiple, required: !!d.required, default: d.default === undefined ? null : d.default,
  }];
  return { ok: true, schema };
}

// Valeur d'exemple pour la sonde dynamique (1re valeur enum, ou test string/number).
function exampleParams(schema) {
  if (!Array.isArray(schema) || !schema.length) return null;
  const d = schema[0];
  let v;
  if (d.type === 'enum') v = d.values && d.values[0] ? d.values[0].value : null;
  else if (d.type === 'number') v = 1;
  else v = 'test';
  if (v == null) return null;
  const out = {}; out[d.key] = v; return out;
}

module.exports = { validateParams, resolveLabel, paramsFromQuery, validateParamsSchema, exampleParams };
