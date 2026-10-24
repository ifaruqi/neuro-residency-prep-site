/* Additive SIMAK routes. Neurology routing, question selection and progress stay independent. */
(function () {
  'use strict';
  var config = window.SIMAK, engine = window.SIMAK_ENGINE, bank = window.SIMAK_BANK;
  var study = window.SIMAK_STUDY;
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
  function count(id, skill) { return bank.filter(function (q) { return q.section === id && (!skill || q.skill === skill); }).length; }
  function modeName(mode) { return { full: 'Simulasi lengkap', peka: 'Simulasi PEKA', english: 'Simulasi English', focus: 'Latihan fokus', review:'Ulangan terjadwal' }[mode] || 'Latihan'; }
  function sessionName(a) { return modeName(a.settings.mode)+(a.settings.packageId&&a.settings.packageId!=='mixed'?' · Paket '+a.settings.packageId:'')+(a.settings.skill?' · '+a.settings.skill:''); }
  function sectionList(mode, section) { return config.sections.filter(function (s) { return mode === 'full' || (mode === 'peka' && s.group === 'PEKA') || (mode === 'english' && s.group === 'English') || (mode === 'focus' && s.id === section); }); }
  function shell(title, subtitle, body) {
    app.innerHTML = '<div class="sm-subnav"><a href="#/simak">SIMAK Pascasarjana</a><a href="#/simak/notebook">Buku kesalahan</a><a href="#/simak/progress">Progres SIMAK</a></div>' +
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
    var due=study.queue(read('notebook',{}),'due',Date.now()).length;
    var resume = current ? '<div class="sm-resume"><div><b>Sesi tersimpan</b><div class="small">' + esc(modeName(current.settings.mode)) + ' · ' + esc(date(current.start)) + (current.settings.timed ? ' · waktu tetap berjalan' : '') + '</div></div><a class="btn" href="#/simak/exam">Lanjutkan sesi</a></div>' : '';
    shell('Bersiap dengan ritme ujian.', 'Latih penalaran, kelola waktu, lalu pahami cara sampai ke jawaban.',
      resume + '<section class="sm-hero"><div><span class="sm-pill">'+bank.length+' soal orisinal · 2 paket berbeda</span><h2>Satu sesi. Lima subtes.<br>Langkah yang terukur.</h2><p>PEKA dan Bahasa Inggris, dengan timer serta aturan nilai masing-masing.</p><a class="btn" href="#/simak/setup/full">Atur simulasi lengkap →</a><a class="sm-text-link" href="#/simak/setup/focus">Mulai latihan singkat</a></div>' +
      '<div class="sm-hero-facts"><div><strong>190</strong><span>soal dalam simulasi lengkap</span></div><div><strong>3 j 30 m</strong><span>waktu pengerjaan</span></div><div><strong>' + attempts.length + '</strong><span>sesi selesai di perangkat ini</span></div></div></section>' +
      '<div class="sm-review-callout"><div><b>'+due+' soal jatuh tempo untuk diulang</b><p class="small muted">Salah, kosong, dan ragu dikumpulkan untuk latihan berikutnya.</p></div><a class="btn secondary" href="#/simak/notebook">Buka buku kesalahan →</a></div>'+
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
      '<label class="sm-field">Keterampilan<select id="sm-skill"><option value="">Semua keterampilan</option></select></label>'+
      '<label class="sm-field">Jumlah soal<select id="sm-count"><option value="10">10 soal</option><option value="20">20 soal</option><option value="all">Semua soal subtes</option></select></label>' +
      '<label class="check"><input id="sm-timed" type="checkbox"> Gunakan timer sesuai proporsi subtes</label><p class="small muted">Pembahasan dapat dibuka setelah memilih jawaban. Jawaban dikunci setelah pembahasan dibuka.</p>' :
      '<label class="sm-field">Paket soal<select id="sm-package"><option value="A">Paket A</option><option value="B">Paket B</option></select></label><p class="small muted">Paket A dan B tidak berbagi soal. Urutan soal dan pilihan tetap dapat berbeda.</p><p>Subtes dikerjakan berurutan. Dalam simulasi ini, subtes yang selesai dikunci; sisa waktunya tidak dipindahkan.</p><p class="small muted">Pembahasan tersedia setelah seluruh sesi selesai. Waktu tetap berjalan saat halaman ditinggalkan.</p>') +
      '<button class="btn" type="submit">' + (focused ? 'Mulai latihan' : 'Mulai simulasi') + '</button><p class="sm-inline-error" id="sm-error" role="alert"></p></form><section class="card"><h2>Rencana sesi</h2><div id="sm-plan"></div></section></div>' +
      '<div class="sm-info small">Aturan penguncian adalah perilaku simulator ini. Periksa instruksi simulasi resmi UI untuk alur ujian periode yang Anda ikuti. Nilai latihan tidak dikonversi menjadi skor standar UI.</div>';
    shell('Siapkan sesi Anda.', 'Atur sekali, lalu fokus pada pengerjaan.', body);
    function update() {
      var selected = focused ? document.getElementById('sm-section').value : null;
      var skill=focused?document.getElementById('sm-skill').value:'';
      var nValue = focused ? document.getElementById('sm-count').value : null;
      var list = sectionList(mode, selected), n = 0, minutes = 0;
      document.getElementById('sm-plan').innerHTML = list.map(function (s, i) {
        var available=count(s.id,skill),num = focused ? (nValue === 'all' ? available : Math.min(Number(nValue),available)) : s.n;
        var mins = s.minutes * num / s.n; n += num; minutes += mins;
        return '<div class="sm-plan-row"><span class="sm-step">' + (i + 1) + '</span><div><b>' + esc(s.name) + '</b><div class="small muted">' + num + ' soal · ' + mins.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' menit' + (focused && !document.getElementById('sm-timed').checked ? ' (acuan; timer nonaktif)' : '') + '</div></div><span class="sm-pill">' + (s.right === 4 ? '+4 / −1' : '+1 / 0') + '</span></div>';
      }).join('') + '<div class="sm-plan-total"><b>' + n + ' soal</b><span>' + minutes.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' menit' + (focused && !document.getElementById('sm-timed').checked ? ' acuan' : '') + '</span></div>';
    }
    function skills(){var section=document.getElementById('sm-section').value,all=Array.from(new Set(bank.filter(function(q){return q.section===section;}).map(function(q){return q.skill;}))).sort();document.getElementById('sm-skill').innerHTML='<option value="">Semua keterampilan</option>'+all.map(function(s){return '<option value="'+esc(s)+'">'+esc(s)+' ('+count(section,s)+')</option>';}).join('');update();}
    if (focused) { document.getElementById('sm-section').onchange=skills;['sm-count','sm-timed','sm-skill'].forEach(function (id) { document.getElementById(id).onchange = update; });skills(); }
    update();
    document.getElementById('sm-form').onsubmit = function (e) {
      e.preventDefault();
      function start() {
        try {
          var selected = focused ? document.getElementById('sm-section').value : null;
          var settings = { mode: mode, section: selected, n: focused ? (document.getElementById('sm-count').value === 'all' ? count(selected) : Number(document.getElementById('sm-count').value)) : null,
            skill:focused?document.getElementById('sm-skill').value:'',packageId:focused?'mixed':document.getElementById('sm-package').value,
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
  function figureHTML(q){return q.figure?'<figure class="sm-figure">'+window.SIMAK_FIGURES.render(q.figure)+'<figcaption class="small muted">Diagram orisinal · sketsa tidak harus sesuai skala</figcaption><button class="sm-link-button" data-sm-zoom="'+esc(q.id)+'">Perbesar diagram</button></figure>':'';}
  function tableHTML(q){return q.table?'<div class="sm-data-table"><table><caption>'+esc(q.table.caption||'Data latihan')+'</caption><thead><tr>'+q.table.columns.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+q.table.rows.map(function(row){return '<tr>'+row.map(function(c){return '<td>'+esc(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>':'';}
  function solutionHTML(q){var s=q.solution||{},steps=s.steps||[];return '<div class="exp"><b>Pembahasan.</b><p>'+esc(q.e)+'</p>'+ (steps.length>1?'<ol>'+steps.map(function(step){return '<li>'+esc(step)+'</li>';}).join('')+'</ol>':'')+(s.rule&&s.rule!==q.e?'<p><b>Kaidah:</b> '+esc(s.rule)+'</p>':'')+(s.shortcut?'<p><b>Cara cepat:</b> '+esc(s.shortcut)+'</p>':'')+(s.trap?'<p><b>Jebakan:</b> '+esc(s.trap)+'</p>':'')+(s.evidence?'<details><summary>Bukti dari bacaan</summary><blockquote>'+esc(s.evidence)+'</blockquote></details>':'')+'</div>';}
  function wireFigures(questions){var map={};questions.forEach(function(q){map[q.id]=q;});app.querySelectorAll('[data-sm-zoom]').forEach(function(el){el.onclick=function(){var q=map[el.dataset.smZoom];if(!q)return;var modal=document.createElement('dialog');modal.className='sm-dialog sm-figure-dialog';modal.innerHTML='<div class="row spread"><h2>Diagram soal</h2><button class="btn secondary">Tutup</button></div><div class="sm-figure-canvas">'+window.SIMAK_FIGURES.render(q.figure)+'</div><p class="small">'+esc(q.figure.alt)+'</p>';app.appendChild(modal);modal.querySelector('button').onclick=function(){modal.close();modal.remove();};modal.addEventListener('cancel',function(){modal.remove();});modal.showModal();};});}
  function completed(exam) {
    if (!exam.end) return;
    var attempts = read('attempts', []);
    if (!attempts.some(function (a) { return a.id === exam.id; })) {
      var score = engine.score(exam), seen = read('seen', {});
      exam.score = score;
      var notebook=study.updateNotebook(read('notebook',{}),exam,exam.end);
      attempts.push(exam);
      exam.blocks.forEach(function (b) { b.questions.forEach(function (q) { seen[q.id] = (seen[q.id] || 0) + 1; }); });
      try{study.persist(localStorage,{attempts:attempts,seen:seen,notebook:notebook,current:null});}
      catch(error){clearClock();shell('Sesi selesai, penyimpanan penuh.', 'Jawaban masih tersedia pada sesi ini.', '<button class="btn" id="sm-export-current">Unduh hasil sesi</button>'); document.getElementById('sm-export-current').onclick = function () { download('simak-hasil.json', exam); }; return; }
    }
    write('current', null); clearClock(); location.hash = '#/simak/result/' + exam.id;
  }

  function examView() {
    var exam = read('current', null);
    if (!exam) { location.hash = '#/simak'; return; }
    study.normalizeExam(exam,false);
    if (!Array.isArray(exam.blocks) || !exam.blocks[exam.blockIndex]) { shell('Sesi tidak dapat dibaca.', 'Simpan cadangan melalui Progres SIMAK sebelum membuat sesi baru.', '<a class="btn" href="#/simak/progress">Buka progres SIMAK</a>'); return; }
    var serial = routeSerial, moved = engine.catchUp(exam, Date.now());
    if (moved) write('current', exam);
    if (exam.end) { completed(exam); return; }
    var lastTrack=Date.now(),tracking=!document.hidden,lastTimeSave=Date.now();
    function track(pause,persist){var now=Date.now(),b=exam.blocks[exam.blockIndex];if(tracking&&!exam.end){var until=exam.deadline===null?now:Math.min(now,exam.deadline);b.spent[b.cur]+=Math.max(0,until-lastTrack);}lastTrack=now;tracking=!pause;if(persist){var stored=read('current',null);if(stored&&stored.id===exam.id)write('current',exam);}}
    examView.flush=function(pause){track(pause,true);};
    function save() {
      var current = read('current', null);
      if (!current || current.id !== exam.id) { clearClock(); route(); return false; }
      if (!write('current', exam)) { var status=document.getElementById('sm-save-status');if(status)status.textContent = 'Gagal menyimpan jawaban. Penyimpanan browser penuh/tidak tersedia.'; return false; }
      return true;
    }
    function expire() {
      if (serial !== routeSerial) return true;
      track(document.hidden,false);
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
      if(!save())return;render();
      var selected = app.querySelector('[data-sm-option="' + oi + '"]'); if (selected) selected.focus();
    }
    function navigate(next) {
      if (expire()) return;
      var b = exam.blocks[exam.blockIndex]; b.cur = next;if(!save())return;render();
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
      var answered = b.answers.filter(function (a) { return a !== null; }).length, focused = study.studyMode(exam.settings.mode);
      shell(s.name, sessionName(exam) + ' · subtes ' + (exam.blockIndex + 1) + ' dari ' + exam.blocks.length,
        '<div class="sm-exam-top"><span><b>Soal ' + (i + 1) + '</b> / ' + b.questions.length + '<span class="sm-separator">·</span>' + answered + ' terjawab</span><div class="sm-clock" id="sm-clock" aria-label="Sisa waktu"></div></div>' +
        (message ? '<p class="sm-announcement" role="status">' + esc(message) + '</p>' : '') +
        '<div class="sm-exam-layout"><section><div class="card sm-question">' + passageHTML(q) +
        (focused ? '<div class="sm-eyebrow">' + esc(q.skill) + '</div>' : '') +
        '<h2 id="sm-stem" tabindex="-1"' + (s.group === 'English' ? ' lang="en"' : '') + '>' + esc(q.q) + '</h2>' + markedSentence(q, order) +figureHTML(q)+tableHTML(q)+
        '<div class="sm-options" role="radiogroup" aria-labelledby="sm-stem">' + order.map(function (oi, k) {
          var cls = b.revealed[i] ? (oi === 0 ? ' sm-correct' : oi === b.answers[i] ? ' sm-wrong' : '') : '';
          return '<button type="button" role="radio" aria-checked="' + (b.answers[i] === oi) + '" class="sm-option' + (b.answers[i] === oi ? ' sm-selected' : '') + cls + '" data-sm-option="' + oi + '"' + (b.revealed[i] ? ' disabled' : '') + '><span class="sm-option-letter">' + letters[k] + '</span><span>' + esc(q.o[oi]) + (b.revealed[i] && oi === 0 ? ' ✓' : '') + '</span></button>';
        }).join('') + '</div>' +
        (focused ? '<fieldset class="sm-confidence"><legend>Keyakinan (opsional)</legend>'+[['yakin','Yakin'],['ragu','Ragu'],['tebak','Menebak']].map(function(c){return '<button type="button" class="sm-confidence-button'+(b.confidence[i]===c[0]?' sm-confidence-selected':'')+'" data-sm-confidence="'+c[0]+'" aria-pressed="'+(b.confidence[i]===c[0])+'"'+(b.revealed[i]?' disabled':'')+'>'+c[1]+'</button>';}).join('')+'</fieldset><div class="row"><button class="btn secondary" id="sm-reveal"' + (b.answers[i] === null || b.revealed[i] ? ' disabled' : '') + '>Periksa jawaban</button></div>' : '') +
        (b.revealed[i] ? '<div role="status"><b>' + (b.answers[i] === 0 ? 'Benar.' : 'Belum tepat.') + '</b>'+solutionHTML(q)+'</div>' : '') +
        '<div class="sm-question-actions"><label class="check"><input id="sm-flag" type="checkbox"' + (b.flags[i] ? ' checked' : '') + '> Ragu-ragu</label><button class="sm-link-button" id="sm-clear"' + (b.answers[i] === null || b.revealed[i] ? ' disabled' : '') + '>Hapus jawaban</button></div>' +
        '<div class="sm-paging"><button class="btn secondary" id="sm-prev"' + (i === 0 ? ' disabled' : '') + '>← Sebelumnya</button>' +
        (i < b.questions.length - 1 ? '<button class="btn" id="sm-next">Berikutnya →</button>' : '<button class="btn" id="sm-end-question">Tinjau subtes</button>') + '</div></div>' +
        '<p class="small muted" id="sm-save-status" role="status">' + (storageOK ? 'Jawaban tersimpan otomatis di browser ini.' : 'Gagal menyimpan. Periksa penyimpanan browser.') + '</p><p class="small muted">Pintasan: A–E untuk memilih, ← → untuk berpindah. ' + (exam.settings.timed ? 'Waktu tetap berjalan saat Anda keluar.' : 'Latihan tanpa batas waktu.') + '</p></section>' +
        '<aside class="sm-sidebar"><div class="card"><h2>Navigasi soal</h2><div class="sm-nav-grid">' + b.questions.map(function (_, k) {
          return '<button class="' + (k === i ? 'sm-current ' : '') + (b.answers[k] !== null ? 'sm-answered ' : '') + (b.flags[k] ? 'sm-flagged' : '') + '" data-sm-nav="' + k + '" aria-label="Soal ' + (k + 1) + (b.answers[k] !== null ? ', terjawab' : ', kosong') + (b.flags[k] ? ', ragu-ragu' : '') + '"' + (k === i ? ' aria-current="step"' : '') + '>' + (k + 1) + (b.flags[k] ? '<sup>?</sup>' : b.answers[k] !== null ? '<sup>✓</sup>' : '') + '</button>';
        }).join('') + '</div><p class="small muted">✓ Terjawab · ? Ragu-ragu</p><button class="btn secondary sm-wide" id="sm-review-block">Tinjau & akhiri subtes</button><a class="sm-text-link" href="#/simak">Simpan & keluar</a></div><div class="sm-score-rule"><b>Aturan nilai</b><p class="small">' + (s.group === 'PEKA' ? 'Benar +4 · salah −1 · kosong 0' : 'Benar +1 · salah 0 · kosong 0') + '</p></div></aside></div>');
      app.querySelectorAll('[data-sm-option]').forEach(function (el) { el.onclick = function () { choose(Number(el.dataset.smOption)); }; });
      app.querySelectorAll('[data-sm-confidence]').forEach(function(el){el.onclick=function(){if(expire()||b.revealed[i])return;b.confidence[i]=el.dataset.smConfidence;save();render();};});
      wireFigures([q]);
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
    interval = setInterval(function () { if (!expire()){updateClock();if(Date.now()-lastTimeSave>=15000){save();lastTimeSave=Date.now();}} }, 500);
    examView.keyHandler = function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || app.querySelector('dialog[open]')) return;
      var b = exam.blocks[exam.blockIndex], index = letters.indexOf(e.key.toUpperCase());
      if (index >= 0 && index < b.orders[b.cur].length && e.key.length === 1) { e.preventDefault(); choose(b.orders[b.cur][index]); }
      else if (e.key === 'ArrowRight' && b.cur < b.questions.length - 1) { e.preventDefault(); navigate(b.cur + 1); }
      else if (e.key === 'ArrowLeft' && b.cur > 0) { e.preventDefault(); navigate(b.cur - 1); }
    };
  }

  function result(id) {
    var attempt = read('attempts', []).find(function (a) { return a.id === id; });
    if (!attempt) { shell('Hasil tidak ditemukan.', 'Riwayat tersimpan pada browser tempat sesi dikerjakan.', '<a href="#/simak/progress">Kembali ke progres SIMAK</a>'); return; }
    var report = engine.score(attempt), pace=study.pacing(attempt), filter = 'all';
    function render() {
      var reports = read('reported', {}),notebookData=read('notebook',{});
      var summary = ['PEKA','English'].filter(function (name) { return report.totals[name].max > 0; }).map(function (name) {
        var s = report.totals[name];
        return '<div class="card sm-result-stat"><span class="sm-eyebrow">' + name + ' · NILAI MENTAH</span><div><strong>' + s.points + '</strong><span class="muted"> / ' + s.max + '</span></div><p class="small">' + s.right + ' benar · ' + s.wrong + ' salah · ' + s.blank + ' kosong</p></div>';
      }).join('');
      shell('Selesai. Saatnya memahami.', sessionName(attempt) + ' · ' + date(attempt.start),
        '<div class="sm-result-grid">' + summary + '</div><p class="sm-info small">Nilai mentah latihan, bukan skor standar UI atau prediksi kelulusan.' + (study.studyMode(attempt.settings.mode) ? ' Latihan dapat membuka pembahasan saat pengerjaan; hasilnya ditandai terpisah dari simulasi.' : '') + '</p>' +
        '<div class="row"><a class="btn" href="'+(attempt.settings.mode==='review'?'#/simak/notebook':'#/simak/setup/'+esc(attempt.settings.mode))+'">Atur sesi baru</a><a class="btn secondary" href="#/simak/notebook">Buku kesalahan</a><a class="btn secondary" href="#/simak/progress">Progres SIMAK</a><button class="btn ghost" id="sm-download-attempt">Unduh hasil</button></div>' +
        '<section class="card"><h2>Strategi & ritme</h2>'+(report.totals.PEKA.max?'<p>PEKA: <b>'+report.totals.PEKA.right*4+'</b> poin jawaban benar − <b>'+report.totals.PEKA.wrong+'</b> penalti salah = <b>'+report.totals.PEKA.points+'</b>. Kosong: '+report.totals.PEKA.blank+' soal.</p>':'')+(report.totals.English.max?'<p>English: '+report.totals.English.blank+' soal kosong. Jawaban salah tidak dikenai penalti pada aturan nilai yang digunakan.</p>':'')+(pace.observed?'<div class="row"><span class="sm-pill">Waktu aktif '+time(pace.active)+'</span><span class="sm-pill">'+pace.slowCorrect+' benar di atas acuan waktu</span><span class="sm-pill">'+pace.fastWrong+' salah di bawah acuan waktu</span></div><p class="small muted">Acuan adalah rata-rata waktu subtes. Di atas 1,5× acuan atau di bawah 0,5× acuan ditandai untuk ditinjau; ini bukan batas waktu per soal. Waktu membaca bacaan bersama tercatat pada soal yang sedang dibuka.</p>':'<p class="small muted">Waktu per soal belum direkam pada sesi versi lama ini.</p>')+'</section>'+
        '<section class="card"><h2>Hasil per subtes</h2><div class="table-wrap"><table><thead><tr><th>Subtes</th><th>Benar</th><th>Salah</th><th>Kosong</th><th>Nilai mentah</th></tr></thead><tbody>' + report.rows.map(function (r) {
          return '<tr><td>' + esc(engine.sections[r.section].name) + '</td><td>' + r.right + '</td><td>' + r.wrong + '</td><td>' + r.blank + '</td><td>' + r.points + ' / ' + r.max + '</td></tr>';
        }).join('') + '</tbody></table></div></section><div class="sm-section-heading"><h2>Pembahasan</h2><div class="tabs">' + [['all','Semua'],['wrong','Salah / kosong'],['flag','Ragu-ragu'],['slow','Benar lambat'],['fast','Salah cepat']].map(function (f) { return '<button data-sm-filter="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div><div id="sm-reviews"></div>');
      var html = '', matched = 0;
      attempt.blocks.forEach(function (b) { b.questions.forEach(function (q, i) {
        var ans = b.answers[i], correct = ans === 0;
        var spent=b.spent&&b.spent[i]||0,reference=engine.sections[b.section].minutes*60000/engine.sections[b.section].n;
        if (filter === 'wrong' && correct || filter === 'flag' && !b.flags[i]) return;
        if(filter==='slow'&&!(correct&&spent>reference*1.5)||filter==='fast'&&!(ans!==null&&!correct&&spent>0&&spent<reference*.5))return;
        matched++;
        html += '<article class="card sm-review"><div class="row spread"><span class="sm-eyebrow">' + esc(engine.sections[b.section].name) + ' · ' + (i + 1) + '</span><span class="tag ' + (correct ? 'ok' : ans === null ? 'warn' : 'bad') + '">' + (correct ? 'Benar' : ans === null ? 'Kosong' : 'Salah') + (b.flags[i] ? ' · Ragu' : '') + '</span></div>' + passageHTML(q) + '<h3>' + esc(q.q) + '</h3>' + markedSentence(q,b.orders[i]) +figureHTML(q)+tableHTML(q)+
          b.orders[i].map(function (oi,k) { return '<div class="sm-review-option' + (oi === 0 ? ' sm-correct' : oi === ans ? ' sm-wrong' : '') + '"><b>' + letters[k] + '.</b> ' + esc(q.o[oi]) + (oi === 0 ? ' ✓ Jawaban benar' : '') + (oi === ans ? ' · Pilihan Anda' : '') + '</div>'; }).join('') +
          solutionHTML(q)+(spent?'<p class="small muted">Waktu aktif: '+time(spent)+(b.confidence&&b.confidence[i]?' · Keyakinan: '+esc(b.confidence[i]):'')+'</p>':'')+notesHTML(q,notebookData)+'<div class="row spread small"><span class="muted">Soal latihan orisinal · ' + esc(q.skill) + '</span><button class="sm-link-button" data-sm-report="' + esc(q.id) + '">' + (reports[q.id] ? 'Ditandai untuk diperiksa ✓' : 'Tandai soal bermasalah') + '</button></div></article>';
      }); });
      document.getElementById('sm-reviews').innerHTML = matched ? html : '<div class="card">Tidak ada soal pada filter ini.</div>';
      app.querySelectorAll('[data-sm-filter]').forEach(function (el) { el.onclick = function () { filter = el.dataset.smFilter; render(); }; });
      app.querySelectorAll('[data-sm-report]').forEach(function (el) { el.onclick = function () { var id = el.dataset.smReport; if (reports[id]) delete reports[id]; else reports[id] = { date: Date.now() }; write('reported',reports); render(); }; });
      document.getElementById('sm-download-attempt').onclick = function () { download('simak-' + attempt.id + '.json',attempt); };
      var qs=attempt.blocks.reduce(function(all,b){return all.concat(b.questions);},[]);wireFigures(qs);wireNotes(qs);
    }
    render();
  }

  function notesHTML(q,source){var item=(source||read('notebook',{}))[q.id]||{},note=item.note||'',reason=item.reason||'';return '<details class="sm-notes"><summary>Catatan belajar'+(note?' · tersimpan':'')+'</summary><label class="sm-field">Penyebab yang ingin ditinjau<select data-sm-reason="'+esc(q.id)+'"><option value="">Pilih (opsional)</option>'+['Salah konsep','Salah hitung','Salah baca','Terburu-buru','Menebak'].map(function(r){return '<option'+(r===reason?' selected':'')+'>'+r+'</option>';}).join('')+'</select></label><label class="sm-field">Catatan pribadi<textarea maxlength="5000" rows="3" data-sm-note="'+esc(q.id)+'">'+esc(note)+'</textarea></label><span class="small muted" data-sm-note-status="'+esc(q.id)+'">Disimpan di browser ini saat Anda selesai mengubah kolom.</span></details>';}
  function wireNotes(qs){var map={};qs.forEach(function(q){map[q.id]=q;});app.querySelectorAll('[data-sm-note],[data-sm-reason]').forEach(function(el){el.onchange=function(){var id=el.dataset.smNote||el.dataset.smReason,q=map[id];if(!q)return;var book=read('notebook',{}),now=Date.now(),item=book[id]||{q:q,note:'',reason:'',streak:0,added:now,lastAttempt:now,lastOutcome:'correct',due:now+86400000};if(el.dataset.smNote)item.note=el.value;else item.reason=el.value;item.updatedAt=now;book[id]=item;var status=app.querySelector('[data-sm-note-status="'+id+'"]');if(status)status.textContent=write('notebook',book)?'Catatan tersimpan.':'Catatan gagal disimpan.';};});}
  function startReview(filter,n){
    var list=study.queue(read('notebook',{}),filter,Date.now());if(!list.length)return;
    function start(){var exam=engine.createReview(list,n==='all'?list.length:Math.min(Number(n)||10,list.length),Date.now());if(!write('current',exam))return;location.hash='#/simak/exam';}
    if(read('current',null))dialog('Ganti sesi tersimpan?','Ulangan akan menggantikan sesi SIMAK yang belum selesai. Riwayat tetap tersedia.','Ganti & mulai',start);else start();
  }
  function notebook(filter){
    if(['all','due','wrong','uncertain'].indexOf(filter)<0)filter='due';
    var book=read('notebook',{}),list=study.queue(book,filter,Date.now()),all=Object.keys(book).length;
    shell('Belajar dari yang belum mantap.', 'Salah, kosong, dan ragu menjadi daftar ulasan. Catat alasan, lalu coba lagi pada hari berikutnya.',
      '<div class="tabs">'+[['due','Jatuh tempo'],['all','Semua'],['wrong','Salah / kosong'],['uncertain','Benar tapi ragu']].map(function(f){return '<a class="btn '+(f[0]===filter?'':'secondary')+'" href="#/simak/notebook/'+f[0]+'">'+f[1]+'</a>';}).join('')+'</div><div class="sm-review-callout"><div><b>'+list.length+' soal pada daftar ini</b><p class="small muted">Total catatan: '+all+'. Jawaban benar yang diulang terlalu dekat tidak memperpanjang jadwal.</p></div><div class="row"><label class="sm-field">Jumlah<select id="sm-review-n"><option value="10">10 soal</option><option value="20">20 soal</option><option value="all">Semua pada daftar</option></select></label><button class="btn" id="sm-start-review"'+(!list.length?' disabled':'')+'>Mulai ulangan</button></div></div><p class="small muted">Jadwal latihan: 1, 3, 7, 14, lalu 30 hari setelah keberhasilan yang terpisah setidaknya 12 jam. Ini pengingat latihan, bukan penilaian penguasaan resmi.</p>'+
      (list.length?list.map(function(item){var q=item.q;return '<article class="card sm-notebook-item"><div class="row spread"><span class="sm-eyebrow">'+esc(engine.sections[q.section].name)+' · '+esc(q.skill)+'</span><span class="tag">'+(item.due<=Date.now()?'Jatuh tempo':'Ulang '+date(item.due))+'</span></div><h3>'+esc(q.q)+'</h3>'+notesHTML(q,book)+'<details class="sm-notebook-solution"><summary>Lihat soal dan pembahasan</summary>'+passageHTML(q)+figureHTML(q)+tableHTML(q)+'<p><b>Jawaban:</b> '+esc(q.o[0])+'</p>'+solutionHTML(q)+'</details><button class="sm-link-button" data-sm-remove="'+q.id+'">Keluarkan dari daftar ulasan</button></article>';}).join(''):'<div class="card">'+(all?'Belum ada soal jatuh tempo pada filter ini. <a href="#/simak/notebook/all">Lihat semua catatan</a>.':'Belum ada catatan. Selesaikan latihan untuk mengumpulkan soal yang perlu ditinjau.')+'</div>'));
    document.getElementById('sm-start-review').onclick=function(){startReview(filter,document.getElementById('sm-review-n').value);};
    app.querySelectorAll('[data-sm-remove]').forEach(function(el){el.onclick=function(){var latest=read('notebook',{});delete latest[el.dataset.smRemove];write('notebook',latest);notebook(filter);};});
    var qs=list.map(function(item){return item.q;});wireFigures(qs);wireNotes(qs);
  }

  function backupHTML(){return '<section class="card"><h2>Cadangkan & pulihkan</h2><p class="small muted">Cadangan khusus SIMAK mencakup riwayat, sesi aktif, catatan, dan jadwal ulasan.</p><button class="btn secondary" id="sm-export">Unduh cadangan SIMAK</button><p class="small muted">Cadangan terakhir: '+(read('backupDate',null)?date(read('backupDate',null)):'belum pernah')+'</p><hr><label class="sm-field">Berkas cadangan JSON<input type="file" id="sm-import-file" accept=".json,application/json"></label><label class="sm-field">Cara memulihkan<select id="sm-import-mode"><option value="merge">Gabungkan dengan progres sekarang</option><option value="replace">Ganti progres SIMAK sekarang</option></select></label><p class="small muted">Penggabungan tidak menggandakan sesi yang sama dan mempertahankan sesi aktif perangkat ini. Penggantian memakai sesi aktif dari cadangan.</p><div id="sm-import-preview" class="sm-import-preview" role="status"></div><button class="btn" id="sm-import-confirm" disabled>Impor cadangan</button><p class="sm-inline-error" id="sm-import-error" role="alert"></p></section>';}
  function wireBackup(){
    document.getElementById('sm-export').onclick=function(){var now=Date.now();download('simak-backup-'+now+'.json',{schema:'simak-backup-v2',date:now,attempts:read('attempts',[]),current:read('current',null),seen:read('seen',{}),reported:read('reported',{}),notebook:read('notebook',{})});write('backupDate',now);progress();};
    var imported=null;
    document.getElementById('sm-import-file').onchange=async function(e){
      imported=null;document.getElementById('sm-import-confirm').disabled=true;document.getElementById('sm-import-error').textContent='';document.getElementById('sm-import-preview').textContent='';
      try{var file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Berkas melebihi 20 MB. Pilih cadangan SIMAK dari aplikasi ini.');imported=study.validateBackup(JSON.parse(await file.text()));document.getElementById('sm-import-preview').textContent=imported.attempts.length+' sesi selesai · '+Object.keys(imported.notebook).length+' catatan · '+(imported.current?'ada sesi aktif':'tanpa sesi aktif')+'. Berkas berhasil diperiksa.';document.getElementById('sm-import-confirm').disabled=false;}
      catch(error){document.getElementById('sm-import-error').textContent=error.message;}
    };
    document.getElementById('sm-import-confirm').onclick=function(){if(!imported)return;var replace=document.getElementById('sm-import-mode').value==='replace';
      function apply(){try{var local={attempts:read('attempts',[]),current:read('current',null),notebook:read('notebook',{}),reported:read('reported',{})},values=study.mergeBackup(local,imported,replace);values.studyMigration=2;values.lastImportAt=Date.now();study.persist(localStorage,values);storageOK=true;progress();document.getElementById('sm-import-preview').textContent='Cadangan berhasil '+(replace?'dipulihkan.':'digabungkan.');}catch(error){document.getElementById('sm-import-error').textContent=error.message;}}
      if(replace)dialog('Ganti progres SIMAK?',imported.attempts.length+' sesi dan '+Object.keys(imported.notebook).length+' catatan dari cadangan akan menggantikan progres SIMAK perangkat ini.','Ganti dengan cadangan',apply);else apply();
    };
  }

  function progress() {
    var attempts = read('attempts',[]), unique = {}, aggregated = {};
    attempts.forEach(function (a) { a.blocks.forEach(function (b) { b.questions.forEach(function (q,i) {
      unique[q.id] = true;
      if (!aggregated[q.section]) aggregated[q.section] = { first: 0, firstRight: 0, repeat: 0, repeatRight: 0, seen: {}, sim: 0, simRight: 0 };
      var st = aggregated[q.section], right = b.answers[i] === 0;
      if (st.seen[q.id]) { st.repeat++; if (right) st.repeatRight++; }
      else { st.first++; if (right) st.firstRight++; st.seen[q.id] = true; }
      if (!study.studyMode(a.settings.mode)) { st.sim++; if (right) st.simRight++; }
    }); }); });
    function accuracy(c,n) { return n ? Math.round(c*100/n) + '% (' + c + '/' + n + ')' : 'Belum ada data'; }
    shell('Lihat perkembangan Anda.', 'Riwayat dan hasil SIMAK tersimpan terpisah dari neurologi, di browser ini.',
      '<div class="sm-result-grid"><div class="card"><span class="sm-eyebrow">SESI SELESAI</span><div class="stat">' + attempts.length + '</div></div><div class="card"><span class="sm-eyebrow">CAKUPAN BANK SAAT INI</span><div class="stat">' + bank.filter(function (q) { return unique[q.id]; }).length + ' / ' + bank.length + '</div></div></div>' +
      '<div class="sm-section-heading"><h2>Ketepatan per subtes</h2><a href="#/simak/setup/focus">Latihan fokus →</a></div><section class="card table-wrap"><table><thead><tr><th>Subtes</th><th>Pertama kali</th><th>Pengulangan</th><th>Simulasi saja</th></tr></thead><tbody>' + config.sections.map(function (s) {
        var a=aggregated[s.id] || {first:0,firstRight:0,repeat:0,repeatRight:0,sim:0,simRight:0};
        return '<tr><td>' + esc(s.name) + (a.first && a.first < 10 ? '<div class="small muted">Sampel masih sedikit</div>' : '') + '</td><td>' + accuracy(a.firstRight,a.first) + '</td><td>' + accuracy(a.repeatRight,a.repeat) + '</td><td>' + accuracy(a.simRight,a.sim) + '</td></tr>';
      }).join('') + '</tbody></table></section><p class="small muted">Pertama kali berarti pertemuan pertama dengan soal, termasuk latihan fokus. Kolom simulasi mengecualikan latihan fokus yang dapat membuka pembahasan.</p><h2>Riwayat sesi</h2>' +
      (attempts.length ? '<div class="sm-history">' + attempts.slice().reverse().map(function (a) { var totals=engine.score(a).totals; return '<a class="card sm-history-row" href="#/simak/result/' + esc(a.id) + '"><div><b>' + esc(sessionName(a)) + '</b><div class="small muted">' + date(a.start) + '</div></div><div class="small">' + ['PEKA','English'].filter(function (k) { return totals[k].max; }).map(function (k) { return k + ' ' + totals[k].points + '/' + totals[k].max; }).join(' · ') + ' →</div></a>'; }).join('') + '</div>' : '<div class="card">Belum ada sesi selesai. <a href="#/simak/setup/focus">Mulai latihan pertama</a>.</div>') +
      backupHTML()+
      '<button class="sm-link-button" id="sm-reset">Hapus progres SIMAK di browser ini</button>');
    wireBackup();
    document.getElementById('sm-reset').onclick = function () { dialog('Hapus progres SIMAK?', 'Riwayat, sesi aktif, dan penanda soal SIMAK pada browser ini akan dihapus. Unduh cadangan terlebih dahulu jika diperlukan.', 'Hapus progres SIMAK', function () { ['attempts','current','seen','reported','backupDate','notebook','lastImportAt'].forEach(function (k) { write(k,null); }); progress(); }); };
  }

  function route() {
    var flush=examView.flush;examView.flush=null;if(flush)flush(true);
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
        case 'notebook':notebook(parts[2]);break;
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
  document.addEventListener('visibilitychange',function () { if(examView.flush)examView.flush(document.hidden);if (!document.hidden && location.hash === '#/simak/exam') route(); });
  window.addEventListener('pagehide',function(){if(examView.flush)examView.flush(true);});
  window.addEventListener('storage',function(e) { if (e.key === keyPrefix+'current' && location.hash === '#/simak/exam') route(); });
  if(!read('studyMigration',null)){var migrated=read('notebook',{});read('attempts',[]).slice().sort(function(a,b){return a.start-b.start;}).forEach(function(a){migrated=study.updateNotebook(migrated,a,a.end||a.start);});if(write('notebook',migrated))write('studyMigration',2);}
  route();
})();
