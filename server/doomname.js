// Tracking DoomName : enregistre un domaine suivi côté labonnealerte auprès de
// DoomName (POST /api/internal/track, secret partagé) pour qu'il entre dans le
// cron DoomName — sans quoi un domaine suivi UNIQUEMENT depuis le kiosque ne
// serait jamais surveillé. Best-effort : un échec ne bloque jamais l'abonnement
// (le poller réessaie chaque cycle, l'appel est idempotent côté DoomName).

const BASE = (process.env.DOOMNAME_TRACK_URL || 'https://doomname.com').replace(/\/$/, '');
const KEY = (process.env.DOOMNAME_INTERNAL_KEY || '').trim();
const TIMEOUT_MS = 5_000;

function isEnabled() { return !!KEY; }

async function trackDomain(domaine) {
  if (!KEY || !domaine) return false; // secret non configuré → no-op silencieux
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + '/api/internal/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': KEY },
      body: JSON.stringify({ domaine }),
      signal: controller.signal,
    });
    if (!res.ok) { console.warn(`[doomname] track ${domaine} : HTTP ${res.status}`); return false; }
    return true;
  } catch (err) {
    console.warn(`[doomname] track ${domaine} échoué : ${err.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { trackDomain, isEnabled };
