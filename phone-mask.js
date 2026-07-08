/* Russian phone input mask: formats any input[type=tel] as +7 (XXX) XXX-XX-XX.
   Installed once via event delegation so it survives DC re-renders and covers every form. */
(function () {
  function digitsOnly(s) { return (s || '').replace(/\D/g, ''); }
  function format(raw) {
    var d = digitsOnly(raw);
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var r = d.slice(1);           // up to 10 national digits
    var out = '+7';
    if (r.length) out += ' (' + r.slice(0, 3);
    if (r.length >= 3) out += ')';
    if (r.length > 3) out += ' ' + r.slice(3, 6);
    if (r.length > 6) out += '-' + r.slice(6, 8);
    if (r.length > 8) out += '-' + r.slice(8, 10);
    return out;
  }
  function onInput(e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if ((el.getAttribute('type') || '').toLowerCase() !== 'tel') return;
    var next = format(el.value);
    if (next === el.value) return;
    el.value = next;
    try { el.setSelectionRange(next.length, next.length); } catch (_) {}
  }
  document.addEventListener('input', onInput, true);
})();
