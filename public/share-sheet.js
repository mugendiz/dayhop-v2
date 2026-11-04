// public/share-sheet.js — DayHop share sheet. The first step toward social
// planning: any card can open a big, thumb-first share panel with one-tap
// channels (WhatsApp, Messages, Facebook, copy, the phone's own share).
//
//   window.DayHopShare.open({ title, text, url, thumb, kicker, openUrl, campaign })
//
// Every shared link carries utm_source=share, the channel and the campaign,
// so pixel.js records where a friend came from. Events: share_open,
// share_sent (source = channel), owned by the planner's guest id.
(function () {
  'use strict';
  var sheet = null, current = null, lastFocus = null, hideTimer = 0;

  function ownerId() {
    try { return localStorage.getItem('dayhop_owner_id') || undefined; } catch (e) { return undefined; }
  }
  function track(type, source) {
    try {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ type: type, source: source || null, owner_id: ownerId() }) });
    } catch (e) { /* never blocks sharing */ }
  }
  function tagged(url, medium, campaign) {
    try {
      var u = new URL(url, location.origin);
      u.searchParams.set('utm_source', 'share');
      u.searchParams.set('utm_medium', medium);
      u.searchParams.set('utm_campaign', campaign || 'card');
      return u.toString();
    } catch (e) { return url; }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function build() {
    sheet = el('div', 'share-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'share-sheet-title');
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="share-sheet-backdrop" data-close></div>' +
      '<div class="share-sheet-panel">' +
      '  <button class="share-sheet-x" type="button" aria-label="Close" data-close>✕</button>' +
      '  <div class="share-sheet-hero"><img class="share-sheet-thumb" alt=""><div class="share-sheet-copy">' +
      '    <p class="share-sheet-kicker"></p><h2 class="share-sheet-title" id="share-sheet-title"></h2>' +
      '    <p class="share-sheet-lede">Send it to the group chat and plan it together.</p></div></div>' +
      '  <div class="share-sheet-grid">' +
      '    <button type="button" class="share-ch share-ch--wa" data-ch="whatsapp"><span aria-hidden="true">💬</span>WhatsApp</button>' +
      '    <button type="button" class="share-ch share-ch--sms" data-ch="sms"><span aria-hidden="true">✉️</span>Messages</button>' +
      '    <button type="button" class="share-ch share-ch--fb" data-ch="facebook"><span aria-hidden="true">👍</span>Facebook</button>' +
      '    <button type="button" class="share-ch share-ch--copy" data-ch="copy"><span aria-hidden="true">🔗</span>Copy link</button>' +
      '  </div>' +
      '  <button type="button" class="share-native" data-ch="native" hidden>More ways to share</button>' +
      '  <a class="share-open" href="#">Open it first →</a>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      var t = e.target.closest('[data-close],[data-ch]');
      if (!t) return;
      if (t.hasAttribute('data-close')) { close(); return; }
      send(t.getAttribute('data-ch'), t);
    });
    document.addEventListener('keydown', function (e) { if (!sheet.hidden && e.key === 'Escape') close(); });
    sheet.querySelector('.share-open').addEventListener('click', function () { track('share_open_page', current && current.campaign); });
  }

  function send(ch, btn) {
    if (!current) return;
    var c = current, url = tagged(c.url, ch, c.campaign), text = c.text || c.title;
    track('share_sent', ch + ':' + (c.campaign || 'card'));
    if (ch === 'whatsapp') { window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener'); return; }
    if (ch === 'sms') { location.href = 'sms:?&body=' + encodeURIComponent(text + ' ' + url); return; }
    if (ch === 'facebook') { window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener'); return; }
    if (ch === 'native' && navigator.share) { navigator.share({ title: c.title, text: text, url: url }).catch(function () {}); return; }
    var done = function () { var label = btn.lastChild; var old = label.textContent; label.textContent = 'Copied!'; setTimeout(function () { label.textContent = old; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(done, function () { window.prompt('Copy this link:', url); });
    else window.prompt('Copy this link:', url);
  }

  function open(opts) {
    if (!sheet) build();
    clearTimeout(hideTimer); // a close still fading out must not hide this open
    current = opts || {};
    lastFocus = document.activeElement;
    var img = sheet.querySelector('.share-sheet-thumb');
    if (current.thumb) { img.src = current.thumb; img.hidden = false; } else { img.hidden = true; }
    sheet.querySelector('.share-sheet-kicker').textContent = current.kicker || 'Share';
    sheet.querySelector('.share-sheet-title').textContent = current.title || 'DayHop';
    var openLink = sheet.querySelector('.share-open');
    if (current.openUrl) { openLink.href = current.openUrl; openLink.hidden = false; } else { openLink.hidden = true; }
    sheet.querySelector('.share-native').hidden = !navigator.share;
    sheet.hidden = false;
    document.documentElement.classList.add('share-sheet-open');
    requestAnimationFrame(function () { sheet.classList.add('in'); sheet.querySelector('.share-ch').focus(); });
    track('share_open', current.campaign || 'card');
  }

  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('in');
    document.documentElement.classList.remove('share-sheet-open');
    hideTimer = setTimeout(function () { sheet.hidden = true; }, 180);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.DayHopShare = { open: open, close: close };
})();
