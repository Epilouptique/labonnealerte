/* share.js — popover de partage réutilisable (cartes + page statut).
   window.LBAShare.open(anchorEl, name, url). Un seul popover ouvert à la fois.
   Icônes SVG inline monochromes (currentColor), pas de CDN. */

(function () {
  'use strict';

  var IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  var IC = {
    whatsapp: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path fill="currentColor" d="M9 8.5c.2-.5.5-.5.7-.5s.5 0 .7.5l.5 1.1c.1.2 0 .4-.1.6l-.4.4c-.2.2-.2.3-.1.5.3.6 1 1.3 1.7 1.6.2.1.4.1.5-.1l.4-.5c.2-.2.4-.2.6-.1l1.1.5c.4.2.5.4.5.6 0 .8-.7 1.4-1.4 1.4-1 0-2.6-.7-3.9-2s-2-2.9-2-3.9c0-.4.2-.9.6-1.6z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M13.2 18v-4.2h1.4l.3-1.8h-1.7v-1c0-.5.2-.8.9-.8h.9V8.6c-.2 0-.7-.1-1.3-.1-1.3 0-2.2.8-2.2 2.3v1.2H9.9v1.8h1.5V18z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M5 5l14 14M19 5L5 19"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M7.5 10h1.6v6H7.5zM8.3 7.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9zM10.6 10h1.5v.8c.3-.5.9-.9 1.7-.9 1.4 0 2 .9 2 2.5V16h-1.6v-3.1c0-.8-.3-1.2-.9-1.2s-1 .4-1 1.2V16h-1.6z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M21.5 4.3 2.8 11.4c-.6.2-.6 1 0 1.2l4.6 1.5 1.8 5.3c.2.5.8.6 1.1.2l2.5-2.7 4.6 3.4c.4.3 1 .1 1.1-.4l3.2-14.5c.1-.6-.5-1.1-1.2-.9zM9.6 14.3l7.4-5.4-6.1 6.2c-.1.1-.2.3-.2.5l-.3 2z"/></svg>',
    bluesky: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 11c-1.2-2.4-4.6-4.7-6.3-4.9C4 5.9 3.5 7 3.7 8.7c.2 1.6 1.5 3.4 3.4 4-1.9.2-2.9 1-2.7 2.2.2 1.2 1.7 1.8 3.5 1.1C12 14.6 12 13 12 13s0 1.6 4.1 3c1.8.7 3.3.1 3.5-1.1.2-1.2-.8-2-2.7-2.2 1.9-.6 3.2-2.4 3.4-4 .2-1.7-.3-2.8-2-2.6C16.6 6.3 13.2 8.6 12 11z"/></svg>',
    mastodon: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 8c0-2 1.5-3 3.5-3.2C10 4.6 11 4.6 12 4.6s2 0 3.5.2C17.5 5 19 6 19 8v4c0 2-1.5 3-3.5 3.2-1.2.1-2.4.1-3.5.1"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 10v2.5M15 10v2.5M8 16.5c1.5.8 4.5 1 6.5.2M8 16.5V19"/></svg>',
    email: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M3.5 6.5 12 13l8.5-6.5"/></svg>',
    sms: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 4h16v11H8l-4 4z"/><path fill="currentColor" d="M8 9h2v2H8zM11 9h2v2h-2zM14 9h2v2h-2z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
  };

  var pop = null, backdrop = null, escHandler = null, outsideHandler = null;

  function enc(s) { return encodeURIComponent(s); }

  function close() {
    if (pop) { pop.remove(); pop = null; }
    if (backdrop) { backdrop.remove(); backdrop = null; }
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler, true); outsideHandler = null; }
  }

  function optLink(icon, label, href) {
    return '<a class="share-opt" href="' + href + '" target="_blank" rel="noopener">' +
      '<span class="share-ic">' + IC[icon] + '</span><span class="share-lbl">' + label + '</span></a>';
  }

  // Grille d'options HTML (réutilisée par le popover ET la face partage des cartes).
  function optionsHTML(name, url) {
    var text = name + ' — alerte gratuite sur labonnealerte.fr';
    var tu = enc(text + ' ' + url);
    var u = enc(url), t = enc(text), n = enc(name);
    return (
      optLink('whatsapp', 'WhatsApp', 'https://wa.me/?text=' + tu) +
      optLink('facebook', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + u) +
      optLink('x', 'X', 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u) +
      optLink('linkedin', 'LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' + u) +
      optLink('telegram', 'Telegram', 'https://t.me/share/url?url=' + u + '&text=' + t) +
      optLink('bluesky', 'Bluesky', 'https://bsky.app/intent/compose?text=' + tu) +
      optLink('mastodon', 'Mastodon', 'https://mastodonshare.com/?url=' + u + '&text=' + t) +
      optLink('email', 'Email', 'mailto:?subject=' + n + '&body=' + tu) +
      (IS_MOBILE ? optLink('sms', 'SMS', 'sms:?&body=' + tu) : '') +
      '<button type="button" class="share-opt share-copy"><span class="share-ic">' + IC.copy + '</span><span class="share-lbl">Copier le lien</span></button>'
    );
  }

  // Câble le bouton « Copier le lien » dans un conteneur (popover ou face de carte).
  function bindCopy(root, url) {
    var btn = root.querySelector('.share-copy');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var lbl = btn.querySelector('.share-lbl');
      var done = function () { var o = lbl.textContent; lbl.textContent = 'Copié ✓'; setTimeout(function () { lbl.textContent = o; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
  }

  function open(anchor, name, url) {
    close(); // un seul à la fois

    var opts = optionsHTML(name, url);

    pop = document.createElement('div');
    pop.className = 'share-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Partager');
    pop.innerHTML =
      '<div class="share-pop-head"><span>Partager</span>' +
      '<button type="button" class="share-close" aria-label="Fermer">×</button></div>' +
      '<div class="share-grid">' + opts + '</div>';

    var mobile = window.matchMedia('(max-width: 480px)').matches;
    if (mobile) {
      backdrop = document.createElement('div');
      backdrop.className = 'share-backdrop';
      document.body.appendChild(backdrop);
      pop.classList.add('sheet');
      document.body.appendChild(pop);
    } else {
      pop.classList.add('anchored');
      document.body.appendChild(pop);
      var r = anchor.getBoundingClientRect();
      var top = window.scrollY + r.bottom + 8;
      var left = window.scrollX + r.right - pop.offsetWidth;
      if (left < 8) left = 8;
      var maxLeft = window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8;
      if (left > maxLeft) left = maxLeft;
      pop.style.top = top + 'px';
      pop.style.left = left + 'px';
    }

    // Copier le lien
    bindCopy(pop, url);
    // Fermer × + clic sur une option ferme aussi
    pop.querySelector('.share-close').addEventListener('click', close);
    pop.querySelectorAll('.share-opt:not(.share-copy)').forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(close, 10); });
    });
    if (backdrop) backdrop.addEventListener('click', close);

    escHandler = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    outsideHandler = function (e) {
      if (pop && !pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close();
    };
    document.addEventListener('mousedown', outsideHandler, true);
  }

  window.LBAShare = { open: open, close: close, optionsHTML: optionsHTML, bindCopy: bindCopy, isMobile: IS_MOBILE };
})();
