// TEMPORARY calibration page (#/kalibrasi): Nadira marks each ChatGPT sample question "pas" or "terlalu sulit".
// Marks stay in this browser (npx.kalibrasi); "Salin hasil" / WhatsApp sends them back. Remove this file,
// data/kalibrasi.js, their script tags and the 'kalibrasi' case in js/app.js after the review.
(function () {
  'use strict';
  var QS = window.KALIBRASI || [], KEY = 'npx.kalibrasi', LETTERS = 'ABCDE';
  var app = document.getElementById('app');
  var TOPIC = {};
  (window.TOPICS || []).forEach(function (t) { TOPIC[t.id] = t.name; });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.marks) return v; } catch (e) { /* storage unavailable */ }
    // Shuffle each question's options once and keep the order, so a reload shows the same letters.
    return { cur: 0, marks: {}, orders: QS.map(function (q) {
      var o = q.o.map(function (_, i) { return i; });
      for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; }
      return o;
    }) };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }

  function summary(s) {
    return 'Kalibrasi soal CBT Neurologi (Nadira)\n' + QS.map(function (_, i) {
      var m = s.marks[i] || {};
      return (i + 1) + '. ' + (m.mark || 'belum dinilai') + (m.reason ? ' – ' + m.reason : '');
    }).join('\n');
  }

  function render() {
    var s = load(), n = QS.length, done = Object.keys(s.marks).filter(function (k) { return s.marks[k].mark; }).length;
    if (!n) { app.innerHTML = '<div class="card">Belum ada soal kalibrasi.</div>'; return; }
    var i = Math.min(Math.max(s.cur, 0), n - 1), q = QS[i], m = s.marks[i] || {}, shown = !!m.shown;
    var html = '<header class="page-head"><span class="eyebrow">Kalibrasi · CBT Neurologi</span><h1>Nilai tingkat soal.</h1>' +
      '<p>Kerjakan dulu, lalu buka kunci. Nilai bukan dari benar atau salahnya jawaban Anda, tapi apakah soal ini wajar untuk dokter umum yang belajar pokok Buku Ajar untuk masuk PPDS. Jika terlalu sulit, tulis alasan singkat.</p></header>' +
      '<div class="exam-top"><div><b>Soal ' + (i + 1) + '</b> <span class="muted">/ ' + n + '</span> <span class="muted small">· ' + done + ' dinilai</span></div>' +
      '<span class="tag' + (m.mark === 'pas' ? ' ok' : m.mark ? ' bad' : '') + '">' + (m.mark || 'belum dinilai') + '</span></div>' +
      '<div class="exam-layout"><div class="card">' +
      '<span class="qtopic">' + esc(TOPIC[q.t] || q.t) + '</span><div class="stem">' + esc(q.q) + '</div>' +
      s.orders[i].map(function (oi, k) {
        var cls = shown ? (oi === 0 ? ' correct' : oi === m.pick ? ' wrong' : '') : (m.pick === oi ? ' sel' : '');
        return (shown ? '<div' : '<button data-o="' + oi + '"') + ' class="opt' + cls + '"><span class="key">' + LETTERS[k] + '</span><span>' + esc(q.o[oi]) + '</span>' + (shown ? '</div>' : '</button>');
      }).join('') +
      (shown ? '<div class="exp"><b>Pembahasan.</b> ' + esc(q.e) + '</div><p class="small muted">Sumber: ' + esc(q.src) + '</p>'
        : '<button class="btn secondary small" id="show">Lihat kunci & pembahasan</button>') +
      '<div class="confidence" role="group" aria-label="Penilaian"><span class="small muted">Penilaian</span>' +
      [['pas', 'Pas'], ['terlalu sulit', 'Terlalu sulit']].map(function (c) {
        return '<button class="choice' + (m.mark === c[0] ? ' on' : '') + '" data-m="' + c[0] + '">' + c[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="field"><span class="small">Alasan (opsional)</span><textarea id="reason" rows="2" maxlength="300" placeholder="Misalnya: detail molekuler, nama studi, sindrom langka">' + esc(m.reason || '') + '</textarea></label>' +
      '<div class="exam-actions"><button class="btn ghost" id="prev"' + (i === 0 ? ' disabled' : '') + '>← Sebelumnya</button>' +
      (i < n - 1 ? '<button class="btn" id="next">Berikutnya →</button>' : '<button class="btn" id="tosend">Kirim hasil ↓</button>') + '</div></div>' +
      '<aside class="card exam-side"><h2>Daftar soal</h2>' +
      '<div class="legend"><span><i class="l-ok"></i>Pas</span><span><i class="l-bad"></i>Terlalu sulit</span></div><div class="nav-grid">' +
      QS.map(function (_, k) {
        var mk = (s.marks[k] || {}).mark;
        return '<button class="' + (k === i ? 'cur ' : '') + (mk === 'pas' ? 'ok' : mk ? 'bad' : '') + '" data-k="' + k + '">' + (k + 1) + '</button>';
      }).join('') + '</div></aside></div>' +
      '<section class="card" id="kirim-hasil"><h2 style="margin-top:0">Kirim hasil</h2>' +
      '<p class="small muted">' + done + ' dari ' + n + ' soal sudah dinilai. Penilaian tersimpan di browser ini; kirim setelah selesai.</p>' +
      '<textarea readonly id="out" rows="6" style="font-size:.85rem">' + esc(summary(s)) + '</textarea>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="copy">Salin hasil</button>' +
      '<a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(summary(s)) + '">Kirim lewat WhatsApp</a>' +
      '<span class="small muted" id="copied" role="status"></span></div></section>';
    app.innerHTML = html;

    function update(fn) { var st = load(); st.marks[i] = st.marks[i] || {}; fn(st, st.marks[i]); save(st); render(); }
    function keepReason(st, mk) { var r = document.getElementById('reason'); if (r) mk.reason = r.value.trim(); }
    app.querySelectorAll('button.opt').forEach(function (b) {
      b.onclick = function () { update(function (st, mk) { keepReason(st, mk); mk.pick = parseInt(b.getAttribute('data-o'), 10); }); };
    });
    var show = document.getElementById('show');
    if (show) show.onclick = function () { update(function (st, mk) { keepReason(st, mk); mk.shown = true; }); };
    app.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () { update(function (st, mk) { keepReason(st, mk); mk.mark = b.getAttribute('data-m'); }); };
    });
    // Save the reason without re-rendering, so a tap that follows the edit is not lost.
    document.getElementById('reason').onchange = function () { var st = load(); st.marks[i] = st.marks[i] || {}; keepReason(st, st.marks[i]); save(st); };
    var tosend = document.getElementById('tosend');
    if (tosend) tosend.onclick = function () { document.getElementById('kirim-hasil').scrollIntoView({ behavior: 'smooth' }); };
    function go(k) { update(function (st, mk) { keepReason(st, mk); st.cur = k; }); window.scrollTo(0, 0); }
    var prev = document.getElementById('prev'), next = document.getElementById('next');
    if (prev) prev.onclick = function () { go(i - 1); };
    if (next) next.onclick = function () { go(i + 1); };
    app.querySelectorAll('.nav-grid button').forEach(function (b) { b.onclick = function () { go(parseInt(b.getAttribute('data-k'), 10)); }; });
    document.getElementById('copy').onclick = function () {
      var text = summary(load()), done2 = function () { document.getElementById('copied').textContent = 'Tersalin.'; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done2, function () { document.getElementById('out').select(); });
      else { document.getElementById('out').select(); document.execCommand('copy'); done2(); }
    };
  }

  function route() { if (/^#\/kalibrasi/.test(location.hash)) render(); }
  window.addEventListener('hashchange', route);
  route();
})();
