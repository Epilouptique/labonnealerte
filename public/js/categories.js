/* categories.js — store client de la taxonomie (chargée une fois depuis /api/categories).
   Expose window.LBACat : load() (promesse), label(slug), all(). Fallback : slug brut. */

(function () {
  'use strict';

  var bySlug = {};
  var list = [];
  var promise = null;

  function label(slug) {
    var e = bySlug[slug];
    return e ? e.label : slug;
  }
  function all() { return list; }

  function load() {
    if (promise) return promise;
    promise = fetch('/api/categories', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (arr) {
        list = Array.isArray(arr) ? arr : [];
        list.forEach(function (e) { bySlug[e.slug] = e; });
        return list;
      })
      .catch(function () { list = []; return list; });
    return promise;
  }

  window.LBACat = { load: load, label: label, all: all };
})();
