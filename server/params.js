// OpenAlert v2 — helpers de paramètres partagés (routes + poller).
// Schéma = tableau plat de descripteurs { key, label, type, values, multiple, required }.
// v2 : un abonnement porte un objet plat, ex { "departement": "05" }.

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
    } else if (desc.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) return { ok: false, error: `nombre attendu pour ${desc.key}` };
      if (typeof desc.min === 'number' && n < desc.min) return { ok: false, error: `${desc.key} < min` };
      if (typeof desc.max === 'number' && n > desc.max) return { ok: false, error: `${desc.key} > max` };
      out[desc.key] = n;
    } else { // string
      out[desc.key] = String(v).slice(0, 120);
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'aucun paramètre fourni' };
  return { ok: true, params: out };
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

module.exports = { validateParams, resolveLabel, paramsFromQuery };
