/* Hash scrolling for JS-rendered (Design Component) pages.
   1) On load: if the URL has #block (e.g. arriving from index.dc.html#pricing),
      the target section is rendered asynchronously and isn't in the DOM when the
      browser tries its native jump — so we poll briefly and scroll once it exists,
      offsetting for the sticky header. We keep correcting for ~1.2s to absorb late
      layout shifts (fonts/images), but stop the moment the user interacts.
   2) Same-page anchor clicks (#demo, #top, …) scroll smoothly with the same offset.
   scrollIntoView is intentionally avoided — window.scrollTo only. */
(function () {
  function headerOffset() {
    var h = document.querySelector('header');
    return (h ? h.offsetHeight : 64) + 16;
  }
  function targetY(id) {
    if (id === 'top' || id === '') return 0;
    var el = document.getElementById(id);
    if (!el) return null;
    return Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - headerOffset());
  }
  function go(id, smooth) {
    var y = targetY(id);
    if (y === null) return false;
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
    return true;
  }

  // (1) initial-load hash — arriving from another page
  var hash = decodeURIComponent((location.hash || '').slice(1));
  if (hash) {
    var userMoved = false;
    var stop = function () { userMoved = true; };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, stop, { passive: true, once: true });
    });
    var start = Date.now();
    (function attempt() {
      if (userMoved) return;
      go(hash, false);
      if (Date.now() - start < 1200) requestAnimationFrame(attempt);
    })();
  }

  // (2) same-page anchor clicks
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.length < 2) return;               // ignore bare "#"
    var id = decodeURIComponent(href.slice(1));
    if (id === 'top' || document.getElementById(id)) {
      e.preventDefault();
      go(id, true);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    }
  }, true);
})();
