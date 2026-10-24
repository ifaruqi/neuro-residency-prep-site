/* Additive SIMAK routes. Neurology routing, question selection and progress stay independent. */
(function () {
  'use strict';
  var config = window.SIMAK, engine = window.SIMAK_ENGINE, bank = window.SIMAK_BANK;
  var app = document.getElementById('app'), interval = null, routeSerial = 0;
  var originalTitle = document.title;
  var storageOK = true, letters = 'ABCDE';
  var keyPrefix = 'npx.simak.';
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(keyPrefix + key)); return v === null ? fallback : v; }
    catch (_) { storageOK = false; return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(keyPrefix + key, JSON.stringify(value)); return true; }
    catch (_) { storageOK = false; return false; }
  }
  function clearClock() { if (interval !== null) { clearInterval(interval); interval = null; } }
  function time(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
  }
  function date(ts) { return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  function count(id) { return bank.filter(function (q) { return q.section === id; }).length; }
  function modeName(mode) { return { full: 'Simulasi lengkap', peka: 'Simulasi PEKA', english: 'Simulasi English', focus: 'Latihan fokus' }[mode] || 'Latihan'; }
  function sectionList(mode, section) { return config.sections.filter(function (s) { return mode === 'full' || (mode === 'peka' && s.group === 'PEKA') || (mode === 'english' && s.group === 'English') || (mode === 'focus' && s.id === section); }); }
  function shell(title, subtitle, body) {
    app.innerHTML = '<div class="sm-subnav"><a href="#/simak">SIMAK Pascasarjana</a><a href="#/simak/progress">Progres SIMAK</a></div>' +
      '<header class="sm-heading"><span class="sm-eyebrow">RUANG LATIHAN · SIMAK UI</span><h1>' + esc(title) + '</h1><p class="muted">' + esc(subtitle) + '</p></header>' +
      (!storageOK ? '<p class="notice" role="alert">Penyimpanan browser tidak tersedia atau penuh. Jawaban tidak dapat disimpan dengan aman. Aktifkan penyimpanan sebelum memulai sesi baru.</p>' : '') + body;
  }
  function dialog(title, message, confirmText, action) {
    var old = document.getElementById('sm-dialog'); if (old) old.remove();
    var el = document.createElement('dialog'); el.id = 'sm-dialog'; el.className = 'sm-dialog';
    el.innerHTML = '<h2>' + esc(title) + '</h2><p>' + esc(message) + '</p><div class="row"><button class="btn secondary" data-cancel>Kembali</button><button class="btn" data-confirm>' + esc(confirmText) + '</button></div>';
    app.appendChild(el);
    el.querySelector('[data-cancel]').onclick = function () { el.close(); el.remove(); };
    el.querySelector('[data-confirm]').onclick = function () { el.close(); el.remove(); action(); };
    el.addEventListener('cancel', function () { el.remove(); });
    el.showModal(); el.querySelector('[data-cancel]').focus();
  }
  function download(name, data) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function home() {
    var current = read('current', null), attempts = read('attempts', []);
    var resume = current ? '<div class="sm-resume"><div><b>Sesi tersimpan</b><div class="small">' + esc(modeName(current.settings.mode)) + ' · ' + esc(date(current.start)) + (current.settings.timed ? ' · waktu tetap berjalan' : '') + '</div></div><a class="btn" href="#/simak/exam">Lanjutkan sesi</a></div>' : '';
    shell('Bersiap dengan ritme ujian.', 'Latih penalaran, kelola waktu, lalu pahami cara sampai ke jawaban.',
      resume + '<section class="sm-hero"><div><span class="sm-pill">240 soal latihan orisinal</span><h2>Satu sesi. Lima subtes.<br>Langkah yang terukur.</h2><p>PEKA dan Bahasa Inggris, dengan timer serta aturan nilai masing-masing.</p><a class="btn" href="#/simak/setup/full">Atur simulasi lengkap →</a><a class="sm-text-link" href="#/simak/setup/focus">Mulai latihan singkat</a></div>' +
      '<div class="sm-hero-facts"><div><strong>190</strong><span>soal dalam simulasi lengkap</span></div><div><strong>3 j 30 m</strong><span>waktu pengerjaan</span></div><div><strong>' + attempts.length + '</strong><span>sesi selesai di perangkat ini</span></div></div></section>' +
      '<div class="sm-section-heading"><h2>Pilih cara berlatih</h2><span class="muted small">Sesuaikan dengan waktu yang tersedia</span></div><div class="sm-mode-grid">' +
      [['peka','01','PEKA','100 soal · 120 menit','Verbal, kuantitatif, dan logika. Benar +4, salah −1, kosong 0.'],['english','02','Bahasa Inggris','90 soal · 90 menit','Structure, written expression, vocabulary, dan reading. Benar +1; tanpa penalti.'],['focus','03','Latihan fokus','10, 20, atau semua soal subtes','Pilih satu subtes. Periksa pembahasan saat berlatih, dengan timer opsional.']].map(function (m) {
        return '<a class="card sm-mode-card" href="#/simak/setup/' + m[0] + '"><span class="sm-eyebrow">' + m[1] + '</span><h3>' + m[2] + '</h3><b class="small">' + m[3] + '</b><p class="muted small">' + m[4] + '</p><span class="sm-arrow" aria-hidden="true">↗</span></a>';
      }).join('') + '</div><div class="sm-info"><b>Kenali nilai yang ditampilkan</b><p>Hasil latihan menunjukkan nilai mentah PEKA dan English secara terpisah. Nilai ini bukan konversi skor resmi UI atau prediksi kelulusan.</p><p class="small">Soal dan bacaan ditulis khusus untuk latihan; bukan soal resmi atau rekonstruksi soal ujian. <a href="' + config.officialUrl + '" target="_blank" rel="noopener">Acuan format UI 2026 ↗</a></p></div>');
  }

  function setup(mode) {
    if (['full','peka','english','focus'].indexOf(mode) < 0) mode = 'full';
    var focused = mode === 'focus';
    var body = '<div class="sm-setup-grid"><form class="card" id="sm-form"><h2>' + esc(modeName(mode)) + '</h2>' +
      (focused ? '<label class="sm-field">Subtes<select id="sm-section">' + config.sections.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' (' + count(s.id) + ' soal)</option>'; }).join('') + '</select></label>' +
      '<label class="sm-field">Jumlah soal<select id="sm-count"><option value="10">10 soal</option><option value="20">20 soal</option><option value="all">Semua soal subtes</option></select></label>' +
      '<label class="check"><input id="sm-timed" type="checkbox"> Gunakan timer sesuai proporsi subtes</label><p class="small muted">Pembahasan dapat dibuka setelah memilih jawaban. Jawaban dikunci setelah pembahasan dibuka.</p>' :
      '<p>Subtes dikerjakan berurutan. Dalam simulasi ini, subtes yang selesai dikunci; sisa waktunya tidak dipindahkan.</p><p class="small muted">Pembahasan tersedia setelah seluruh sesi selesai. Waktu tetap berjalan saat halaman ditinggalkan.</p>') +
      '<button class="btn" type="submit">' + (focused ? 'Mulai latihan' : 'Mulai simulasi') + '</button><p class="sm-inline-error" id="sm-error" role="alert"></p></form><section class="card"><h2>Rencana sesi</h2><div id="sm-plan"></div></section></div>' +
      '<div class="sm-info small">Aturan penguncian adalah perilaku simulator ini. Periksa instruksi simulasi resmi UI untuk alur ujian periode yang Anda ikuti. Nilai latihan tidak dikonversi menjadi skor standar UI.</div>';
    shell('Siapkan sesi Anda.', 'Atur sekali, lalu fokus pada pengerjaan.', body);
    function update() {
      var selected = focused ? document.getElementById('sm-section').value : null;
      var nValue = focused ? document.getElementById('sm-count').value : null;
      var list = sectionList(mode, selected), n = 0, minutes = 0;
      document.getElementById('sm-plan').innerHTML = list.map(function (s, i) {
        var num = focused ? (nValue === 'all' ? count(s.id) : Number(nValue)) : s.n;
        var mins = s.minutes * num / s.n; n += num; minutes += mins;
        return '<div class="sm-plan-row"><span class="sm-step">' + (i + 1) + '</span><div><b>' + esc(s.name) + '</b><div class="small muted">' + num + ' soal · ' + mins.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' menit' + (focused && !document.getElementById('sm-timed').checked ? ' (acuan; timer nonaktif)' : '') + '</div></div><span class="sm-pill">' + (s.right === 4 ? '+4 / −1' : '+1 / 0') + '</span></div>';
      }).join('') + '<div class="sm-plan-total"><b>' + n + ' soal</b><span>' + minutes.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' menit' + (focused && !document.getElementById('sm-timed').checked ? ' acuan' : '') + '</span></div>';
    }
    if (focused) ['sm-section','sm-count','sm-timed'].forEach(function (id) { document.getElementById(id).onchange = update; });
    update();
    document.getElementById('sm-form').onsubmit = function (e) {
      e.preventDefault();
      function start() {
        try {
          var selected = focused ? document.getElementById('sm-section').value : null;
          var settings = { mode: mode, section: selected, n: focused ? (document.getElementById('sm-count').value === 'all' ? count(selected) : Number(document.getElementById('sm-count').value)) : null,
            timed: !focused || document.getElementById('sm-timed').checked };
          var exam = engine.create(bank, settings, read('seen', {}), Date.now());
          if (!write('current', exam)) throw new Error('Tidak dapat menyimpan sesi. Periksa penyimpanan browser.');
          location.hash = '#/simak/exam';
        } catch (err) { document.getElementById('sm-error').textContent = err.message; }
      }
      if (read('current', null)) dialog('Ganti sesi tersimpan?', 'Sesi SIMAK yang belum selesai akan diganti. Riwayat sesi yang sudah selesai tetap tersedia.', 'Ganti & mulai', start);
      else start();
    };
  }

  function markedSentence(q, order) {
    if (!q.marked) return '';
    return '<p class="sm-marked" lang="en">' + q.marked.map(function (m) { return '<span><u>' + esc(m.text) + '</u><sup>(' + letters[order.indexOf(m.oi)] + ')</sup></span>'; }).join(' ') + '</p>';
  }
  function passageHTML(q) {
    return q.passage ? '<details class="sm-passage" open><summary>' + esc(q.passage.title) + ' <span class="small muted">· bacaan/skenario</span></summary><div' + (q.section === 'reading' ? ' lang="en"' : '') + '>' + esc(q.passage.text).replace(/\n\n/g, '</div><div>') + '</div></details>' : '';
  }
  function completed(exam) {
    if (!exam.end) return;
    var attempts = read('attempts', []);
    if (!attempts.some(function (a) { return a.id === exam.id; })) {
      var score = engine.score(exam), seen = read('seen', {});
      exam.score = score;
      // Persist history first; never clear the recoverable current session on a write failure.
      attempts.push(exam);
      if (!write('attempts', attempts)) { shell('Sesi selesai, penyimpanan penuh.', 'Jawaban masih tersedia pada sesi ini.', '<button class="btn" id="sm-export-current">Unduh hasil sesi</button>'); document.getElementById('sm-export-current').onclick = function () { download('simak-hasil.json', exam); }; return; }
      exam.blocks.forEach(function (b) { b.questions.forEach(function (q) { seen[q.id] = (seen[q.id] || 0) + 1; }); });
      write('seen', seen);
    }
    write('current', null); clearClock(); location.hash = '#/simak/result/' + exam.id;
  }

  function examView() {
    var exam = read('current', null);
    if (!exam) { location.hash = '#/simak'; return; }
    if (!Array.isArray(exam.blocks) || !exam.blocks[exam.blockIndex]) { shell('Sesi tidak dapat dibaca.', 'Simpan cadangan melalui Progres SIMAK sebelum membuat sesi baru.', '<a class="btn" href="#/simak/progress">Buka progres SIMAK</a>'); return; }
    var serial = routeSerial, moved = engine.catchUp(exam, Date.now());
    if (moved) write('current', exam);
    if (exam.end) { completed(exam); return; }
    function save() {
      var current = read('current', null);
      if (!current || current.id !== exam.id) { clearClock(); route(); return false; }
      if (!write('current', exam)) { document.getElementById('sm-save-status').textContent = 'Gagal menyimpan jawaban. Penyimpanan browser penuh/tidak tersedia.'; return false; }
      return true;
    }
    function expire() {
      if (serial !== routeSerial) return true;
      if (engine.catchUp(exam, Date.now())) {
        var modal = document.getElementById('sm-dialog'); if (modal) { modal.close(); modal.remove(); }
        if (!save()) return true;
        if (exam.end) completed(exam); else render('Waktu subtes sebelumnya habis. Anda masuk ke subtes berikutnya.');
        return true;
      }
      return false;
    }
    function choose(oi) {
      if (expire()) return;
      var b = exam.blocks[exam.blockIndex], i = b.cur;
      if (b.revealed[i]) return;
      b.answers[i] = oi;
      save(); render();
      var selected = app.querySelector('[data-sm-option="' + oi + '"]'); if (selected) selected.focus();
    }
    function navigate(next) {
      if (expire()) return;
      var b = exam.blocks[exam.blockIndex]; b.cur = next; save(); render();
      document.getElementById('sm-stem').focus(); window.scrollTo(0, 0);
    }
    function finishBlock() {
      if (expire()) return;
      var b = exam.blocks[exam.blockIndex], blank = b.answers.filter(function (a) { return a === null; }).length;
      var flags = b.flags.filter(Boolean).length, last = exam.blockIndex === exam.blocks.length - 1;
      dialog(last ? 'Selesaikan sesi?' : 'Kunci subtes ini?', blank + ' soal kosong dan ' + flags + ' ditandai ragu. ' + (last ? 'Hasil dan pembahasan akan ditampilkan.' : 'Anda tidak dapat kembali ke subtes ini. Sisa waktu tidak dipindahkan.'), last ? 'Selesai & lihat hasil' : 'Lanjut subtes berikutnya', function () {
        if (expire()) return;
        engine.advance(exam, Date.now());
        if (!save()) return;
        if (exam.end) completed(exam); else render('Subtes berikutnya dimulai.');
        window.scrollTo(0, 0);
      });
    }
    function render(message) {
      var b = exam.blocks[exam.blockIndex], s = engine.sections[b.section], i = b.cur, q = b.questions[i], order = b.orders[i];
      var answered = b.answers.filter(function (a) { return a !== null; }).length, focused = exam.settings.mode === 'focus';
      shell(s.name, modeName(exam.settings.mode) + ' · subtes ' + (exam.blockIndex + 1) + ' dari ' + exam.blocks.length,
        '<div class="sm-exam-top"><span><b>Soal ' + (i + 1) + '</b> / ' + b.questions.length + '<span class="sm-separator">·</span>' + answered + ' terjawab</span><div class="sm-clock" id="sm-clock" aria-label="Sisa waktu"></div></div>' +
        (message ? '<p class="sm-announcement" role="status">' + esc(message) + '</p>' : '') +
        '<div class="sm-exam-layout"><section><div class="card sm-question">' + passageHTML(q) +
        (focused ? '<div class="sm-eyebrow">' + esc(q.skill) + '</div>' : '') +
        '<h2 id="sm-stem" tabindex="-1"' + (s.group === 'English' ? ' lang="en"' : '') + '>' + esc(q.q) + '</h2>' + markedSentence(q, order) +
        '<div class="sm-options" role="radiogroup" aria-labelledby="sm-stem">' + order.map(function (oi, k) {
          var cls = b.revealed[i] ? (oi === 0 ? ' sm-correct' : oi === b.answers[i] ? ' sm-wrong' : '') : '';
          return '<button type="button" role="radio" aria-checked="' + (b.answers[i] === oi) + '" class="sm-option' + (b.answers[i] === oi ? ' sm-selected' : '') + cls + '" data-sm-option="' + oi + '"' + (b.revealed[i] ? ' disabled' : '') + '><span class="sm-option-letter">' + letters[k] + '</span><span>' + esc(q.o[oi]) + (b.revealed[i] && oi === 0 ? ' ✓' : '') + '</span></button>';
        }).join('') + '</div>' +
        (focused ? '<div class="row"><button class="btn secondary" id="sm-reveal"' + (b.answers[i] === null || b.revealed[i] ? ' disabled' : '') + '>Periksa jawaban</button></div>' : '') +
        (b.revealed[i] ? '<div class="exp" role="status"><b>' + (b.answers[i] === 0 ? 'Benar.' : 'Belum tepat.') + '</b> ' + esc(q.e) + '</div>' : '') +
        '<div class="sm-question-actions"><label class="check"><input id="sm-flag" type="checkbox"' + (b.flags[i] ? ' checked' : '') + '> Ragu-ragu</label><button class="sm-link-button" id="sm-clear"' + (b.answers[i] === null || b.revealed[i] ? ' disabled' : '') + '>Hapus jawaban</button></div>' +
        '<div class="sm-paging"><button class="btn secondary" id="sm-prev"' + (i === 0 ? ' disabled' : '') + '>← Sebelumnya</button>' +
        (i < b.questions.length - 1 ? '<button class="btn" id="sm-next">Berikutnya →</button>' : '<button class="btn" id="sm-end-question">Tinjau subtes</button>') + '</div></div>' +
        '<p class="small muted" id="sm-save-status" role="status">' + (storageOK ? 'Jawaban tersimpan otomatis di browser ini.' : 'Gagal menyimpan. Periksa penyimpanan browser.') + '</p><p class="small muted">Pintasan: A–E untuk memilih, ← → untuk berpindah. ' + (exam.settings.timed ? 'Waktu tetap berjalan saat Anda keluar.' : 'Latihan tanpa batas waktu.') + '</p></section>' +
        '<aside class="sm-sidebar"><div class="card"><h2>Navigasi soal</h2><div class="sm-nav-grid">' + b.questions.map(function (_, k) {
          return '<button class="' + (k === i ? 'sm-current ' : '') + (b.answers[k] !== null ? 'sm-answered ' : '') + (b.flags[k] ? 'sm-flagged' : '') + '" data-sm-nav="' + k + '" aria-label="Soal ' + (k + 1) + (b.answers[k] !== null ? ', terjawab' : ', kosong') + (b.flags[k] ? ', ragu-ragu' : '') + '"' + (k === i ? ' aria-current="step"' : '') + '>' + (k + 1) + (b.flags[k] ? '<sup>?</sup>' : b.answers[k] !== null ? '<sup>✓</sup>' : '') + '</button>';
        }).join('') + '</div><p class="small muted">✓ Terjawab · ? Ragu-ragu</p><button class="btn secondary sm-wide" id="sm-review-block">Tinjau & akhiri subtes</button><a class="sm-text-link" href="#/simak">Simpan & keluar</a></div><div class="sm-score-rule"><b>Aturan nilai</b><p class="small">' + (s.group === 'PEKA' ? 'Benar +4 · salah −1 · kosong 0' : 'Benar +1 · salah 0 · kosong 0') + '</p></div></aside></div>');
      app.querySelectorAll('[data-sm-option]').forEach(function (el) { el.onclick = function () { choose(Number(el.dataset.smOption)); }; });
      app.querySelectorAll('[data-sm-nav]').forEach(function (el) { el.onclick = function () { navigate(Number(el.dataset.smNav)); }; });
      document.getElementById('sm-flag').onchange = function (e) { if (expire()) return; b.flags[i] = e.target.checked; save(); render(); };
      document.getElementById('sm-clear').onclick = function () { if (expire()) return; b.answers[i] = null; save(); render(); };
      document.getElementById('sm-prev').onclick = function () { navigate(i - 1); };
      var next = document.getElementById('sm-next'); if (next) next.onclick = function () { navigate(i + 1); };
      var lastButton = document.getElementById('sm-end-question'); if (lastButton) lastButton.onclick = finishBlock;
      document.getElementById('sm-review-block').onclick = function () {
        if (expire()) return;
        var blanks = b.answers.map(function (a, index) { return a === null ? index + 1 : null; }).filter(Boolean);
        var flagged = b.flags.map(function (f, index) { return f ? index + 1 : null; }).filter(Boolean);
        var panel = document.createElement('section'); panel.className = 'card sm-review-panel'; panel.id = 'sm-review-panel';
        var previous = document.getElementById('sm-review-panel'); if (previous) previous.remove();
        panel.innerHTML = '<h2>Tinjau subtes</h2><p>Kosong: ' + blanks.length + ' · Ragu-ragu: ' + flagged.length + '</p>' +
          [['Kosong',blanks],['Ragu-ragu',flagged]].map(function (group) { return '<h3>' + group[0] + '</h3><div class="row">' + (group[1].length ? group[1].map(function (num) { return '<button class="btn ghost small" data-sm-jump="' + (num - 1) + '">Soal ' + num + '</button>'; }).join('') : '<span class="small muted">Tidak ada.</span>') + '</div>'; }).join('') + '<button class="btn" id="sm-confirm-block">Akhiri subtes ini</button>';
        app.appendChild(panel); panel.querySelectorAll('[data-sm-jump]').forEach(function (el) { el.onclick = function () { navigate(Number(el.dataset.smJump)); }; });
        document.getElementById('sm-confirm-block').onclick = finishBlock; panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      var reveal = document.getElementById('sm-reveal'); if (reveal) reveal.onclick = function () { if (expire() || b.answers[i] === null) return; b.revealed[i] = true; save(); render(); };
      updateClock();
    }
    function updateClock() {
      var el = document.getElementById('sm-clock'); if (!el) return;
      el.textContent = exam.deadline === null ? 'Tanpa timer' : time(exam.deadline - Date.now());
      el.classList.toggle('sm-low', exam.deadline !== null && exam.deadline - Date.now() < 60000);
    }
    clearClock(); render(moved ? 'Sesi disesuaikan dengan waktu yang sudah berlalu.' : '');
    interval = setInterval(function () { if (!expire()) updateClock(); }, 500);
    examView.keyHandler = function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.getElementById('sm-dialog')) return;
      var b = exam.blocks[exam.blockIndex], index = letters.indexOf(e.key.toUpperCase());
      if (index >= 0 && index < b.orders[b.cur].length && e.key.length === 1) { e.preventDefault(); choose(b.orders[b.cur][index]); }
      else if (e.key === 'ArrowRight' && b.cur < b.questions.length - 1) { e.preventDefault(); navigate(b.cur + 1); }
      else if (e.key === 'ArrowLeft' && b.cur > 0) { e.preventDefault(); navigate(b.cur - 1); }
    };
  }

  function result(id) {
    var attempt = read('attempts', []).find(function (a) { return a.id === id; });
    if (!attempt) { shell('Hasil tidak ditemukan.', 'Riwayat tersimpan pada browser tempat sesi dikerjakan.', '<a href="#/simak/progress">Kembali ke progres SIMAK</a>'); return; }
    var report = engine.score(attempt), filter = 'all';
    function render() {
      var reports = read('reported', {});
      var summary = ['PEKA','English'].filter(function (name) { return report.totals[name].max > 0; }).map(function (name) {
        var s = report.totals[name];
        return '<div class="card sm-result-stat"><span class="sm-eyebrow">' + name + ' · NILAI MENTAH</span><div><strong>' + s.points + '</strong><span class="muted"> / ' + s.max + '</span></div><p class="small">' + s.right + ' benar · ' + s.wrong + ' salah · ' + s.blank + ' kosong</p></div>';
      }).join('');
      shell('Selesai. Saatnya memahami.', modeName(attempt.settings.mode) + ' · ' + date(attempt.start),
        '<div class="sm-result-grid">' + summary + '</div><p class="sm-info small">Nilai mentah latihan, bukan skor standar UI atau prediksi kelulusan.' + (attempt.settings.mode === 'focus' ? ' Latihan fokus dapat membuka pembahasan saat pengerjaan; hasilnya ditandai terpisah dari simulasi.' : '') + '</p>' +
        '<div class="row"><a class="btn" href="#/simak/setup/' + esc(attempt.settings.mode) + '">Atur sesi baru</a><a class="btn secondary" href="#/simak/progress">Progres SIMAK</a><button class="btn ghost" id="sm-download-attempt">Unduh hasil</button></div>' +
        '<section class="card"><h2>Hasil per subtes</h2><div class="table-wrap"><table><thead><tr><th>Subtes</th><th>Benar</th><th>Salah</th><th>Kosong</th><th>Nilai mentah</th></tr></thead><tbody>' + report.rows.map(function (r) {
          return '<tr><td>' + esc(engine.sections[r.section].name) + '</td><td>' + r.right + '</td><td>' + r.wrong + '</td><td>' + r.blank + '</td><td>' + r.points + ' / ' + r.max + '</td></tr>';
        }).join('') + '</tbody></table></div></section><div class="sm-section-heading"><h2>Pembahasan</h2><div class="tabs">' + [['all','Semua'],['wrong','Salah / kosong'],['flag','Ragu-ragu']].map(function (f) { return '<button data-sm-filter="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div><div id="sm-reviews"></div>');
      var html = '', matched = 0;
      attempt.blocks.forEach(function (b) { b.questions.forEach(function (q, i) {
        var ans = b.answers[i], correct = ans === 0;
        if (filter === 'wrong' && correct || filter === 'flag' && !b.flags[i]) return;
        matched++;
        html += '<article class="card sm-review"><div class="row spread"><span class="sm-eyebrow">' + esc(engine.sections[b.section].name) + ' · ' + (i + 1) + '</span><span class="tag ' + (correct ? 'ok' : ans === null ? 'warn' : 'bad') + '">' + (correct ? 'Benar' : ans === null ? 'Kosong' : 'Salah') + (b.flags[i] ? ' · Ragu' : '') + '</span></div>' + passageHTML(q) + '<h3>' + esc(q.q) + '</h3>' + markedSentence(q,b.orders[i]) +
          b.orders[i].map(function (oi,k) { return '<div class="sm-review-option' + (oi === 0 ? ' sm-correct' : oi === ans ? ' sm-wrong' : '') + '"><b>' + letters[k] + '.</b> ' + esc(q.o[oi]) + (oi === 0 ? ' ✓ Jawaban benar' : '') + (oi === ans ? ' · Pilihan Anda' : '') + '</div>'; }).join('') +
          '<div class="exp"><b>Pembahasan.</b> ' + esc(q.e) + '</div><div class="row spread small"><span class="muted">Soal latihan orisinal · ' + esc(q.skill) + '</span><button class="sm-link-button" data-sm-report="' + esc(q.id) + '">' + (reports[q.id] ? 'Ditandai untuk diperiksa ✓' : 'Tandai soal bermasalah') + '</button></div></article>';
      }); });
      document.getElementById('sm-reviews').innerHTML = matched ? html : '<div class="card">Tidak ada soal pada filter ini.</div>';
      app.querySelectorAll('[data-sm-filter]').forEach(function (el) { el.onclick = function () { filter = el.dataset.smFilter; render(); }; });
      app.querySelectorAll('[data-sm-report]').forEach(function (el) { el.onclick = function () { var id = el.dataset.smReport; if (reports[id]) delete reports[id]; else reports[id] = { date: Date.now() }; write('reported',reports); render(); }; });
      document.getElementById('sm-download-attempt').onclick = function () { download('simak-' + attempt.id + '.json',attempt); };
    }
    render();
  }

  function progress() {
    var attempts = read('attempts',[]), unique = {}, aggregated = {};
    attempts.forEach(function (a) { a.blocks.forEach(function (b) { b.questions.forEach(function (q,i) {
      unique[q.id] = true;
      if (!aggregated[q.section]) aggregated[q.section] = { first: 0, firstRight: 0, repeat: 0, repeatRight: 0, seen: {}, sim: 0, simRight: 0 };
      var st = aggregated[q.section], right = b.answers[i] === 0;
      if (st.seen[q.id]) { st.repeat++; if (right) st.repeatRight++; }
      else { st.first++; if (right) st.firstRight++; st.seen[q.id] = true; }
      if (a.settings.mode !== 'focus') { st.sim++; if (right) st.simRight++; }
    }); }); });
    function accuracy(c,n) { return n ? Math.round(c*100/n) + '% (' + c + '/' + n + ')' : 'Belum ada data'; }
    shell('Lihat perkembangan Anda.', 'Riwayat dan hasil SIMAK tersimpan terpisah dari neurologi, di browser ini.',
      '<div class="sm-result-grid"><div class="card"><span class="sm-eyebrow">SESI SELESAI</span><div class="stat">' + attempts.length + '</div></div><div class="card"><span class="sm-eyebrow">CAKUPAN BANK SAAT INI</span><div class="stat">' + bank.filter(function (q) { return unique[q.id]; }).length + ' / ' + bank.length + '</div></div></div>' +
      '<div class="sm-section-heading"><h2>Ketepatan per subtes</h2><a href="#/simak/setup/focus">Latihan fokus →</a></div><section class="card table-wrap"><table><thead><tr><th>Subtes</th><th>Pertama kali</th><th>Pengulangan</th><th>Simulasi saja</th></tr></thead><tbody>' + config.sections.map(function (s) {
        var a=aggregated[s.id] || {first:0,firstRight:0,repeat:0,repeatRight:0,sim:0,simRight:0};
        return '<tr><td>' + esc(s.name) + (a.first && a.first < 10 ? '<div class="small muted">Sampel masih sedikit</div>' : '') + '</td><td>' + accuracy(a.firstRight,a.first) + '</td><td>' + accuracy(a.repeatRight,a.repeat) + '</td><td>' + accuracy(a.simRight,a.sim) + '</td></tr>';
      }).join('') + '</tbody></table></section><p class="small muted">Pertama kali berarti pertemuan pertama dengan soal, termasuk latihan fokus. Kolom simulasi mengecualikan latihan fokus yang dapat membuka pembahasan.</p><h2>Riwayat sesi</h2>' +
      (attempts.length ? '<div class="sm-history">' + attempts.slice().reverse().map(function (a) { var totals=engine.score(a).totals; return '<a class="card sm-history-row" href="#/simak/result/' + esc(a.id) + '"><div><b>' + esc(modeName(a.settings.mode)) + '</b><div class="small muted">' + date(a.start) + '</div></div><div class="small">' + ['PEKA','English'].filter(function (k) { return totals[k].max; }).map(function (k) { return k + ' ' + totals[k].points + '/' + totals[k].max; }).join(' · ') + ' →</div></a>'; }).join('') + '</div>' : '<div class="card">Belum ada sesi selesai. <a href="#/simak/setup/focus">Mulai latihan pertama</a>.</div>') +
      '<section class="card"><h2>Simpan salinan</h2><p class="small muted">Unduh riwayat, sesi aktif, dan soal yang ditandai untuk diperiksa. Cadangan ini khusus SIMAK.</p><button class="btn secondary" id="sm-export">Unduh cadangan SIMAK</button><p class="small muted">Cadangan terakhir: ' + (read('backupDate',null) ? date(read('backupDate',null)) : 'belum pernah') + '</p></section>' +
      '<button class="sm-link-button" id="sm-reset">Hapus progres SIMAK di browser ini</button>');
    document.getElementById('sm-export').onclick = function () { var now=Date.now(); download('simak-backup-' + now + '.json',{schema:'simak-backup-v1',date:now,attempts:attempts,current:read('current',null),seen:read('seen',{}),reported:read('reported',{})}); write('backupDate',now); progress(); };
    document.getElementById('sm-reset').onclick = function () { dialog('Hapus progres SIMAK?', 'Riwayat, sesi aktif, dan penanda soal SIMAK pada browser ini akan dihapus. Unduh cadangan terlebih dahulu jika diperlukan.', 'Hapus progres SIMAK', function () { ['attempts','current','seen','reported','backupDate'].forEach(function (k) { write(k,null); }); progress(); }); };
  }

  function route() {
    routeSerial++; clearClock(); examView.keyHandler = null;
    var parts = location.hash.replace(/^#\/?/,'').split('/'), isSimak = parts[0] === 'simak';
    document.title = isSimak ? 'SIMAK UI Pascasarjana · Latihan' : originalTitle;
    app.classList.toggle('sm-app',isSimak);
    var nav = document.querySelector('.sm-navlink'); if (nav) { if (isSimak) nav.setAttribute('aria-current','page'); else nav.removeAttribute('aria-current'); }
    if (!isSimak) {
      // Add a discoverable entry without changing the neurology home function or setup defaults.
      if (!parts[0] && !document.getElementById('sm-home-entry')) {
        var tile=document.createElement('a'); tile.id='sm-home-entry'; tile.href='#/simak'; tile.className='card tile sm-home-entry';
        tile.innerHTML='<b>SIMAK UI Pascasarjana →</b><span class="small muted">PEKA & Bahasa Inggris · latihan dan progres tersendiri</span>';
        app.appendChild(tile);
      }
      return;
    }
    window.scrollTo(0,0);
    try {
      switch (parts[1]) {
        case 'setup': setup(parts[2]); break;
        case 'exam': examView(); break;
        case 'result': result(parts[2]); break;
        case 'progress': progress(); break;
        default: home();
      }
    } catch (error) {
      shell('SIMAK belum dapat dibuka.', error.message, '<a class="btn secondary" href="#/setup">Kembali ke latihan neurologi</a>');
    }
  }

  // The existing router runs first. This additional listener only owns #/simak routes.
  var style=document.createElement('link'); style.rel='stylesheet'; style.href='css/simak.css'; document.head.appendChild(style);
  var topbar=document.querySelector('.topbar'); if (topbar) topbar.classList.add('sm-enabled');
  var nav=document.querySelector('.topbar nav');
  if (nav && !nav.querySelector('.sm-navlink')) { var link=document.createElement('a'); link.href='#/simak'; link.className='sm-navlink'; link.textContent='SIMAK'; nav.appendChild(link); }
  try { engine.validate(bank); } catch(error) { console.error('SIMAK bank:',error); }
  window.addEventListener('hashchange',route);
  document.addEventListener('keydown',function (e) { if (examView.keyHandler) examView.keyHandler(e); });
  document.addEventListener('visibilitychange',function () { if (!document.hidden && location.hash === '#/simak/exam') route(); });
  window.addEventListener('storage',function(e) { if (e.key === keyPrefix+'current' && location.hash === '#/simak/exam') route(); });
  route();
})();
