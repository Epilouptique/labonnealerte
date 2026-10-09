// PROPOSITION (non branchée) — propager une erreur de surveillance seulement APRÈS N échecs
// CONSÉCUTIFS. Destiné aux sources où l'aléa isolé est NORMAL et fréquent (403 anti-bot, SSRF
// bloqué, pages instables) : propager chaque échec individuel inonderait les incidents 'failed'.
// Avec ce garde-fou, un échec isolé reste silencieux (état de repli), mais une panne DURABLE
// (N échecs d'affilée) finit par être propagée → le poller la traite en incident, visible.
//
// À VALIDER PAR HUGO AVANT USAGE. Candidats : veille-page, veille-rss, panneaupocket, veille-agenda.
// N'est encore câblé sur AUCUNE source.
//
// Hypothèse : une seule instance serveur (compteurs en mémoire, comme le reste du projet). Un
// redémarrage remet les compteurs à zéro — sans gravité : au pire on retarde d'un cycle la
// propagation d'une panne déjà installée.
//
// Seuil configurable : option `threshold` par appel, sinon variable d'env SOURCE_FAIL_THRESHOLD,
// sinon 3.

function defaultThreshold() {
  const n = parseInt(process.env.SOURCE_FAIL_THRESHOLD, 10);
  return Number.isInteger(n) && n > 0 ? n : 3;
}

function defaultInactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: null };
}

// Compteurs d'échecs consécutifs, par clé. Exportés pour les tests (reset/peek).
const fails = new Map();

/**
 * Enveloppe un check pour ne propager qu'après `threshold` échecs consécutifs.
 * @param {string} id        identifiant de source (préfixe de clé et de log)
 * @param {Function} checkFn fonction async (…args) => résultat ; peut throw
 * @param {object} [opts]
 * @param {number} [opts.threshold]           nb d'échecs consécutifs avant propagation
 * @param {(args:any[])=>string} [opts.keyFn] clé par combinaison (sources paramétriques)
 * @param {(args:any[])=>any} [opts.fallback] valeur renvoyée tant qu'on avale (défaut inactive)
 * @returns {Function} même signature que checkFn
 */
function withFailThreshold(id, checkFn, opts = {}) {
  const threshold = opts.threshold || defaultThreshold();
  const keyFn = opts.keyFn || (() => id);
  const fallback = opts.fallback || (() => defaultInactive());

  return async function (...args) {
    const key = id + '::' + keyFn(args);
    let result;
    try {
      result = await checkFn.apply(this, args);
    } catch (err) {
      const n = (fails.get(key) || 0) + 1;
      fails.set(key, n);
      if (n >= threshold) {
        // Panne durable : on propage (le poller en fait un incident). Le compteur reste tel
        // quel ; il repartira de zéro au prochain succès.
        throw new Error(`${id} : ${n} échecs consécutifs (seuil ${threshold}) → incident : ${err.message}`);
      }
      // Échec isolé toléré : on avale et on signale discrètement.
      console.warn(`[${id}] échec ${n}/${threshold} (toléré, repli inactive) : ${err.message}`);
      return fallback(args);
    }
    // Succès : la série d'échecs est rompue.
    if (fails.get(key)) fails.delete(key);
    return result;
  };
}

module.exports = {
  withFailThreshold,
  _test: {
    reset: () => fails.clear(),
    peek: (key) => fails.get(key) || 0,
    size: () => fails.size,
  },
};
