// Brique partagée (LOT E1) : source officielle BROADCAST sur flux RSS/Atom FIXE,
// filtrée par titre. Mêmes briques que le moteur veille-rss (safe-fetch anti-SSRF +
// UA identifiable + robots.txt, feed-parser, seuil de N échecs consécutifs) sans le
// modifier : veille-rss n'a pas de filtre par titre.
//   Actif si le dernier item RETENU a moins de freshMs ; since = sa date → un nouvel
//   item (≥ 24 h après) re-notifie (logique d'épisode du poller).
'use strict';

const { safeFetchText } = require('../../safe-fetch');
const { parseFeed } = require('./feed-parser');
const { recordFailure, recordSuccess, defaultThreshold } = require('./fail-threshold');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;
const FRESH_MS = 72 * 60 * 60 * 1000;

/**
 * @param {{ id:string, feedUrl:string, url:string, filter:(item)=>boolean,
 *           format:(item)=>string, freshMs?:number }} cfg
 */
function createOfficialFeedSource(cfg) {
  const { id, feedUrl, url, filter, format, freshMs = FRESH_MS } = cfg;
  const inactive = () => ({ state: 'inactive', since: null, until: null, message: null, url });

  async function check() {
    const key = id + '::' + feedUrl;
    let xml;
    try {
      xml = await safeFetchText(feedUrl, {
        timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, robots: true,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      });
    } catch (err) {
      // Toléré tant que < N échecs consécutifs, propagé (incident) au Nᵉ.
      const r = recordFailure(key, defaultThreshold());
      if (r.escalate) throw new Error(`${id} : ${r.count} échecs consécutifs (seuil ${r.threshold}) : ${err.message}`);
      console.warn(`[${id}] échec ${r.count}/${r.threshold} (toléré) : ${err.message}`);
      return inactive();
    }
    recordSuccess(key);

    let latest = null;
    for (const it of parseFeed(xml).items) {
      if (!it.date || !filter(it)) continue;
      if (!latest || it.date > latest.date) latest = it;
    }
    if (!latest || Date.now() - latest.date.getTime() >= freshMs) return inactive();
    return { state: 'active', since: latest.date, until: null, message: format(latest), url: latest.link || url };
  }

  return { id, check };
}

module.exports = { createOfficialFeedSource };
