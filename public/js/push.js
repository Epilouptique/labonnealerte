/* push.js — panneau « Notifications » (mode connecté uniquement).
   Jamais de prompt sauvage : l'utilisateur clique « Activer » pour déclencher
   la demande de permission. Gère le push par appareil + la préférence email. */

(function () {
  'use strict';

  var S = window.LBASession;
  // Le contenu « Notifications » vit désormais dans le panneau « Mon compte ».
  var panel = document.getElementById('notif-mount');
  if (!panel || !S) return;

  var token = S.get();
  if (!token) return; // anonyme : pas de panneau

  var pushSupported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // Convertit la clé VAPID base64url en Uint8Array (requis par PushManager).
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  var state = { emailEnabled: true, vapidKey: '', deviceOn: false };

  // Squelette du panneau.
  // Le label de section du panneau (« Mon compte ») vit désormais hors du
  // conteneur qui tourne (voir index.html #acct-panel-label) — plus de titre ici.
  panel.innerHTML =
    '<div class="notif-card">' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Sur cet appareil</strong>' +
    '      <span class="notif-sub" id="notif-device-sub">Recevez les alertes en notification push.</span></div>' +
    '    <button type="button" class="notif-toggle" id="notif-device-btn" role="switch" aria-label="Notifications sur cet appareil"></button>' +
    '  </div>' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Par email</strong>' +
    '      <span class="notif-sub">Recevez aussi les alertes par email.</span></div>' +
    '    <button type="button" class="notif-toggle" id="notif-email-toggle" role="switch" aria-label="Notifications par email"></button>' +
    '  </div>' +
    '</div>';

  var deviceBtn = document.getElementById('notif-device-btn');
  var deviceSub = document.getElementById('notif-device-sub');
  var emailToggle = document.getElementById('notif-email-toggle');

  function renderEmail() {
    emailToggle.classList.toggle('on', !!state.emailEnabled);
    emailToggle.setAttribute('aria-checked', state.emailEnabled ? 'true' : 'false');
  }

  function renderDevice() {
    if (!pushSupported) {
      deviceBtn.hidden = true;
      deviceSub.textContent = 'Non pris en charge par ce navigateur.';
      return;
    }
    if (Notification.permission === 'denied') {
      deviceBtn.hidden = true;
      deviceSub.textContent =
        'Notifications bloquées. Réautorisez-les dans les réglages du navigateur (icône 🔒 dans la barre d\'adresse).';
      return;
    }
    // Interrupteur (même composant que « Par email ») : l'état est porté par le
    // switch, le sous-texte n'a plus à expliquer comment désactiver.
    deviceBtn.hidden = false;
    deviceBtn.classList.toggle('on', !!state.deviceOn);
    deviceBtn.setAttribute('aria-checked', state.deviceOn ? 'true' : 'false');
    deviceSub.textContent = state.deviceOn
      ? 'Cet appareil recevra les alertes.'
      : 'Recevez les alertes en notification push.';
  }

  // ---- Activation / désactivation sur l'appareil ----
  async function enableDevice() {
    deviceBtn.disabled = true;
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        renderDevice();
        return;
      }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.vapidKey),
        });
      }
      var res = await api('/api/push/subscribe', { token: token, subscription: sub.toJSON ? sub.toJSON() : sub });
      if (!res.ok) throw new Error('subscribe HTTP ' + res.status);

      state.deviceOn = true;
      renderDevice();
      // Notification locale de bienvenue (pas un push serveur).
      reg.showNotification('🔔 Notifications actives', {
        body: 'Les notifications sont actives sur cet appareil.',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
      });
    } catch (err) {
      console.warn('[push] activation échouée :', err && err.message);
      deviceSub.textContent = 'Activation impossible pour le moment. Réessayez.';
    } finally {
      deviceBtn.disabled = false;
    }
  }

  async function disableDevice() {
    deviceBtn.disabled = true;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        var endpoint = sub.endpoint;
        await sub.unsubscribe().catch(function () {});
        await api('/api/push/unsubscribe', { token: token, endpoint: endpoint });
      }
      state.deviceOn = false;
      renderDevice();
    } catch (err) {
      console.warn('[push] désactivation échouée :', err && err.message);
    } finally {
      deviceBtn.disabled = false;
    }
  }

  deviceBtn.addEventListener('click', function () {
    if (state.deviceOn) disableDevice();
    else enableDevice();
  });

  // ---- Préférence email ----
  emailToggle.addEventListener('click', async function () {
    var next = !state.emailEnabled;
    state.emailEnabled = next;
    renderEmail();
    try {
      var res = await api('/api/my-alerts/preferences', { token: token, email_enabled: next });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      state.emailEnabled = !next; // rollback visuel
      renderEmail();
      console.warn('[push] maj préférence email échouée :', err && err.message);
    }
  });

  // ---- Chargement initial de l'état ----
  (async function init() {
    try {
      var alertsRes = await fetch('/api/my-alerts?token=' + encodeURIComponent(token), {
        headers: { Accept: 'application/json' },
      });
      if (alertsRes.status === 401) return; // session invalide : on n'affiche rien
      var data = await alertsRes.json();
      state.emailEnabled = data.email_enabled !== false;

      if (pushSupported) {
        var keyRes = await fetch('/api/push/vapid-key');
        var keyData = await keyRes.json();
        state.vapidKey = keyData.key || '';
        if (keyData.enabled && state.vapidKey) {
          var reg = await navigator.serviceWorker.ready;
          var sub = await reg.pushManager.getSubscription();
          state.deviceOn = !!sub;
        } else {
          pushSupported = false; // push non configuré côté serveur
        }
      }

      renderEmail();
      renderDevice();
      // La visibilité est gérée par le panneau « Mon compte » (pas ici).
    } catch (err) {
      console.warn('[push] init panneau échouée :', err && err.message);
    }
  })();
})();
