// public/hero-carousel.js — the homepage carousel under the prompt
// (routes/heroCarousel.js serves the slides). Each slide has a thumbnail;
// tapping one opens the share sheet (public/share-sheet.js) with an "open
// it first" link, so the first move on a card is passing it on.
(function () {
  'use strict';
  var root = document.getElementById('hero-carousel');
  if (!root) return;
  var track = root.querySelector('.hc-track');
  var dots = root.querySelector('.hc-dots');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function slide(s, i, n) {
    var b = el('button', 'hc-slide hc-slide--' + s.key.replace(/-\d+$/, ''));
    b.type = 'button';
    b.setAttribute('role', 'group');
    b.setAttribute('aria-roledescription', 'slide');
    b.setAttribute('aria-label', (i + 1) + ' of ' + n + ': ' + s.title + '. Tap to share.');
    var img = el('img', 'hc-thumb');
    img.src = s.thumb; img.alt = ''; img.width = 112; img.height = 112; img.loading = i ? 'lazy' : 'eager';
    b.appendChild(img);
    var t = el('span', 'hc-text');
    t.appendChild(el('span', 'hc-kicker', s.kicker));
    t.appendChild(el('span', 'hc-title', s.title));
    t.appendChild(el('span', 'hc-sub', s.sub));
    b.appendChild(t);
    var sh = el('span', 'hc-share');
    sh.setAttribute('aria-hidden', 'true');
    sh.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
    b.appendChild(sh);
    b.addEventListener('click', function () {
      if (!window.DayHopShare) { location.href = s.url; return; }
      window.DayHopShare.open({
        title: s.title, kicker: s.kicker, text: s.share, thumb: s.thumb,
        url: location.origin + s.url, openUrl: s.url + '?utm_source=home&utm_medium=carousel&utm_campaign=' + s.key,
        campaign: s.key
      });
    });
    return b;
  }

  function current() {
    var w = track.clientWidth || 1;
    return Math.round(track.scrollLeft / w);
  }
  function go(i) {
    var n = track.children.length;
    i = (i + n) % n;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  }
  function paint() {
    var i = current();
    Array.prototype.forEach.call(dots.children, function (d, k) { d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
  }

  fetch('/api/carousel').then(function (r) { return r.json(); }).then(function (d) {
    var list = (d && d.slides) || [];
    if (!list.length) return;
    list.forEach(function (s, i) {
      track.appendChild(slide(s, i, list.length));
      var dot = el('button', 'hc-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Show slide ' + (i + 1));
      dot.addEventListener('click', function () { go(i); });
      dots.appendChild(dot);
    });
    root.querySelector('.hc-prev').addEventListener('click', function () { go(current() - 1); });
    root.querySelector('.hc-next').addEventListener('click', function () { go(current() + 1); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(paint); }, { passive: true });
    root.hidden = false;
    paint();
  }).catch(function () { /* the carousel is optional; the page works without it */ });
})();
