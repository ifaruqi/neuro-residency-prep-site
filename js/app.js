(function () {
  'use strict';

  var app = document.getElementById('app');
  var TOPIC = {};
  TOPICS.forEach(function (t) { TOPIC[t.id] = t; });
  var LETTERS = 'ABCDE';

  // Stable ids from topic + stem, so progress survives bank updates.
  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  var QMAP = {};
  QB.forEach(function (q) { q.id = q.t + '-' + hash(q.q); QMAP[q.id] = q; });
  // Book references (data/refs.js): { id: { v: volume, p: 'pages', quote: 'short supporting quote' } }
  // nib = not found in the book: kept in data but excluded from try-outs, since every answer must be grounded.
  var REFS = window.REFS || {};
  QB.forEach(function (q) {
    var r = REFS[q.id];
    if (!r) return;
    if (r.nib) { q.nib = true; return; }
    q.src = 'Buku Ajar Neurologi Ed. 2, Vol. ' + r.v + ', hlm. ' + r.p;
    if (r.a) q.o[0] = r.a;
    if (r.q) q.q = r.q; // id stays based on the original stem, so progress is kept
    if (r.e) q.e = r.e;
  });
  // Grounded = answer verified against the book with a page citation. Questions outside the book are only
  // included when the user opts in ("Sertakan soal di luar Buku Ajar").
  QB.forEach(function (q) { q.grounded = !q.nib && q.src !== 'AI'; });
  var POOL = QB.filter(function (q) { return q.grounded; });
  var OUTSIDE = QB.filter(function (q) { return !q.grounded; });
  function poolFor(outside) { return outside ? QB : POOL; }

  // Bank Soal Lama: rewritten past-paper items (data/past.js). Kept separate from the Buku Ajar bank.
  var PASTQ = (window.PAST || []).map(function (r) {
    var q = { t: r.t, q: r.q, o: r.o.slice(), e: r.e, src: r.src || null,
      past: { paper: r.paper, no: r.no, key: r.key, agree: r.agree } };
    q.id = 'PP-' + hash(r.paper + '#' + r.no);
    q.grounded = !!r.src;
    QMAP[q.id] = q;
    return q;
  });
  var PAPERS = [];
  PASTQ.forEach(function (q) { if (PAPERS.indexOf(q.past.paper) < 0) PAPERS.push(q.past.paper); });
  PAPERS.sort();

  function pickPast(settings) {
    var list = PASTQ.filter(function (q) {
      return (settings.paper === 'all' || q.past.paper === settings.paper) && settings.topics.indexOf(q.t) >= 0;
    });
    if (settings.order === 'urut' && settings.paper !== 'all') {
      return list.sort(function (a, b) { return a.past.no - b.past.no; });
    }
    var seen = store.get('seen', {});
    return shuffle(list).sort(function (a, b) { return (seen[a.id] || 0) - (seen[b.id] || 0); }).slice(0, settings.n);
  }

  // ---------- storage ----------
  var store = {
    get: function (k, d) {
      try { var v = JSON.parse(localStorage.getItem('npx.' + k)); return v === null ? d : v; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('npx.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    }
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function barClass(p) { return p >= 75 ? 'ok' : p >= 50 ? 'warn' : 'bad'; }

  // ---------- question selection ----------
  // Numeric option sets (e.g. GCS totals) read better sorted; everything else is shuffled.
  function firstNum(s) { var m = s.match(/\d+([.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : 0; }
  function optionOrder(q) {
    var idx = q.o.map(function (_, i) { return i; });
    var unit = function (o) { return o.replace(/[\d.,–\-\/<>≤≥\s]/g, ''); };
    var numeric = q.o.every(function (o) { return /^[<>≤≥]?\s*\d/.test(o.trim()) && unit(o) === unit(q.o[0]) && o.length < 25; });
    if (numeric) {
      return idx.sort(function (a, b) {
        return firstNum(q.o[a]) - firstNum(q.o[b]);
      });
    }
    return shuffle(idx);
  }

  // Quota per topic proportional to weight; least-seen questions first.
  function pickQuestions(n, topics, outside) {
    var seen = store.get('seen', {});
    var pools = {};
    topics.forEach(function (t) {
      pools[t] = shuffle(poolFor(outside).filter(function (q) { return q.t === t; }))
        .sort(function (a, b) { return (seen[a.id] || 0) - (seen[b.id] || 0); });
    });
    var total = topics.reduce(function (s, t) { return s + pools[t].length; }, 0);
    n = Math.min(n, total);
    var wsum = topics.reduce(function (s, t) { return s + TOPIC[t].w; }, 0);
    var quota = {}, assigned = 0;
    topics.forEach(function (t) {
      quota[t] = Math.min(pools[t].length, Math.floor(n * TOPIC[t].w / wsum));
      assigned += quota[t];
    });
    // Hand out the remainder to topics that still have unused questions, heaviest first.
    var order = topics.slice().sort(function (a, b) { return TOPIC[b].w - TOPIC[a].w; });
    while (assigned < n) {
      var progressed = false;
      for (var i = 0; i < order.length && assigned < n; i++) {
        var t = order[i];
        if (quota[t] < pools[t].length) { quota[t]++; assigned++; progressed = true; }
      }
      if (!progressed) break;
    }
    var picked = [];
    topics.forEach(function (t) { picked = picked.concat(pools[t].slice(0, quota[t])); });
    return shuffle(picked);
  }

  // ---------- exam state ----------
  // Study features follow the SIMAK module: practice mode with per-question explanations, confidence,
  // pause, active time per question, a mistake notebook with spaced review, and backups.
  var DAY = 86400000, INTERVALS = [1, 3, 7, 14, 30], REF_MS = 60000; // pace reference: 1 minute per question
  function isStudy(s) { return !!(s && (s.review || s.mode === 'latihan')); }
  function modeName(s) { return s && s.review ? 'Ulangan' : s && s.mode === 'latihan' ? 'Latihan' : 'Simulasi'; }
  function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }

  function startExam(settings, list) {
    var qs = list || (settings.bank === 'lama' ? pickPast(settings) : pickQuestions(settings.n, settings.topics, !!settings.outside));
    if (!qs.length) return false;
    var now = Date.now();
    var exam = {
      id: 'a' + now.toString(36),
      settings: settings,
      qids: qs.map(function (q) { return q.id; }),
      orders: qs.map(optionOrder),
      answers: fill(qs.length, null),
      flags: fill(qs.length, false),
      conf: fill(qs.length, null),
      revealed: fill(qs.length, false),
      spent: fill(qs.length, 0),
      cur: 0,
      created: now,
      start: now, // shifted forward by pauses, so now - start is active time
      limit: settings.timed ? qs.length * settings.secPerQ : 0,
      pausedAt: null,
      pauseCount: 0
    };
    store.set('current', exam);
    if (!settings.review) store.set('lastSettings', settings);
    location.hash = '#/ujian';
    return true;
  }
  function confirmReplace(fn) {
    if (store.get('current', null)) dialog('Ganti sesi tersimpan?', 'Try out yang belum selesai akan diganti. Riwayat yang sudah selesai tetap tersedia.', 'Ganti & mulai', fn);
    else fn();
  }

  function rebuildStats(attempts) {
    var seen = {}, qstats = {};
    attempts.forEach(function (a) {
      a.qids.forEach(function (id, i) {
        seen[id] = (seen[id] || 0) + 1;
        var s = qstats[id] || (qstats[id] = { n: 0, c: 0 });
        s.n++; if (a.answers[i] === 0) s.c++;
      });
    });
    return { seen: seen, qstats: qstats };
  }

  // Wrong, blank and uncertain answers enter the notebook; a confident correct retry at least 12 hours
  // after the previous one moves the next review out to 1, 3, 7, 14, then 30 days.
  function updateNotebook(book, a, now) {
    a.qids.forEach(function (id, i) {
      if (!QMAP[id]) return;
      var correct = a.answers[i] === 0;
      var unsure = !!a.flags[i] || !!(a.conf && (a.conf[i] === 'ragu' || a.conf[i] === 'tebak'));
      var item = book[id];
      if (correct && !unsure && !item) return;
      item = item || { note: '', reason: '', streak: 0, added: now };
      var separated = !item.lastAttempt || now - item.lastAttempt >= 12 * 3600000;
      if (!correct || unsure) { item.streak = 0; item.due = now + DAY; }
      else if (separated) { item.streak = Math.min(5, (item.streak || 0) + 1); item.due = now + INTERVALS[item.streak - 1] * DAY; }
      item.lastOutcome = !correct ? (a.answers[i] === null ? 'blank' : 'wrong') : unsure ? 'uncertain' : 'correct';
      item.lastAttempt = now; item.updatedAt = now;
      book[id] = item;
    });
    return book;
  }
  function queue(filter) {
    var book = store.get('notebook', {}), now = Date.now();
    return Object.keys(book).filter(function (id) {
      var it = book[id];
      return QMAP[id] && (filter === 'all' || (filter === 'due' && it.due <= now) ||
        (filter === 'wrong' && (it.lastOutcome === 'wrong' || it.lastOutcome === 'blank')) ||
        (filter === 'uncertain' && it.lastOutcome === 'uncertain'));
    }).sort(function (a, b) { return book[a].due - book[b].due || book[a].added - book[b].added; });
  }
  // Seed the notebook once from history recorded before it existed.
  if (!store.get('studyMigration', null)) {
    var seeded = store.get('notebook', {});
    store.get('attempts', []).slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (a) {
      updateNotebook(seeded, a, a.date + (a.duration || 0) * 1000);
    });
    store.set('notebook', seeded);
    store.set('studyMigration', 1);
  }

  function finishExam(exam, expired) {
    var correct = 0, byTopic = {}, now = Date.now();
    exam.qids.forEach(function (id, i) {
      var q = QMAP[id];
      if (!q) return;
      var ok = exam.answers[i] === 0;
      if (ok) correct++;
      var bt = byTopic[q.t] || (byTopic[q.t] = { n: 0, c: 0 });
      bt.n++; if (ok) bt.c++;
    });
    var attempt = {
      id: exam.id,
      date: exam.created || exam.start,
      duration: Math.round(((exam.pausedAt || now) - exam.start) / 1000),
      settings: exam.settings,
      qids: exam.qids,
      orders: exam.orders,
      answers: exam.answers,
      flags: exam.flags,
      conf: exam.conf,
      revealed: exam.revealed,
      spent: exam.spent,
      pauseCount: exam.pauseCount || 0,
      expired: !!expired,
      correct: correct,
      total: exam.qids.length,
      byTopic: byTopic
    };
    var attempts = store.get('attempts', []);
    attempts.push(attempt);
    var seen = store.get('seen', {}), qstats = store.get('qstats', {});
    exam.qids.forEach(function (id, i) {
      seen[id] = (seen[id] || 0) + 1;
      var s = qstats[id] || (qstats[id] = { n: 0, c: 0 });
      s.n++; if (exam.answers[i] === 0) s.c++;
    });
    store.set('attempts', attempts);
    store.set('seen', seen);
    store.set('qstats', qstats);
    store.set('notebook', updateNotebook(store.get('notebook', {}), attempt, now));
    store.set('current', null);
    location.hash = '#/hasil/' + attempt.id;
  }

  // ---------- shared UI ----------
  function dialog(title, message, confirmText, action, withInput) {
    var old = document.getElementById('nx-dialog');
    if (old) old.remove();
    var el = document.createElement('dialog');
    el.id = 'nx-dialog'; el.className = 'dialog';
    el.innerHTML = '<h2>' + esc(title) + '</h2>' + (message ? '<p>' + esc(message) + '</p>' : '') +
      (withInput ? '<textarea rows="3" maxlength="1000"></textarea>' : '') +
      '<div class="row">' + (action ? '<button class="btn secondary" data-cancel>Kembali</button>' : '') +
      '<button class="btn" data-confirm>' + esc(confirmText) + '</button></div>';
    document.body.appendChild(el);
    function close() { el.close(); el.remove(); }
    var cancel = el.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = close;
    el.querySelector('[data-confirm]').onclick = function () {
      var value = withInput ? el.querySelector('textarea').value : undefined;
      close();
      if (action) action(value);
    };
    el.addEventListener('cancel', function () { el.remove(); });
    el.showModal();
    (el.querySelector('textarea') || cancel || el.querySelector('[data-confirm]')).focus();
  }
  function download(name, data) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function fmtDay(ts) { return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); }
  function fmtMs(ms) { return fmtTime(ms / 1000); }

  function sourceHTML(q) {
    return q.grounded ? '<span class="muted">Sumber: ' + esc(q.src) + '</span>'
      : '<span class="tag warn">' + (q.past ? 'Tidak ditemukan di Buku Ajar — jawaban dari literatur standar' : 'Di luar Buku Ajar — pengetahuan umum, tidak ditemukan di buku') + '</span>';
  }
  function expHTML(q) {
    return '<div class="exp"><b>Pembahasan.</b> ' + esc(q.e) +
      (q.quote ? '<div class="small" style="margin-top:6px"><i>Buku Ajar: “' + esc(q.quote) + '”</i></div>' : '') +
      (q.past && q.past.agree === false ? '<div class="small" style="margin-top:6px"><span class="tag warn">Kunci di rekap soal: ' + esc(q.past.key || '-') + '</span> Jawaban di sini mengikuti ' + (q.grounded ? 'Buku Ajar' : 'literatur standar') + '.</div>' : '') +
      '</div>';
  }
  function qLabel(q) { return esc(TOPIC[q.t] ? TOPIC[q.t].name : q.t) + (q.past ? ' · ' + esc(q.past.paper) + ' no. ' + q.past.no : ''); }

  var REASONS = ['Salah konsep', 'Lupa fakta', 'Salah baca soal', 'Terburu-buru', 'Menebak'];
  function notesHTML(id) {
    var it = store.get('notebook', {})[id] || {};
    return '<details class="notes"><summary>Catatan belajar' + (it.note ? ' · tersimpan' : '') + '</summary>' +
      '<label class="field"><span>Penyebab yang ingin ditinjau</span><select data-reason="' + id + '"><option value="">Pilih (opsional)</option>' +
      REASONS.map(function (r) { return '<option' + (r === it.reason ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Catatan pribadi</span><textarea rows="3" maxlength="5000" data-note="' + id + '">' + esc(it.note || '') + '</textarea></label>' +
      '<span class="small muted" data-note-status="' + id + '">Disimpan di browser ini setelah kolom diubah.</span></details>';
  }
  function wireNotes() {
    app.querySelectorAll('[data-note],[data-reason]').forEach(function (el) {
      el.onchange = function () {
        var id = el.getAttribute('data-note') || el.getAttribute('data-reason');
        var book = store.get('notebook', {}), now = Date.now();
        var it = book[id] || { note: '', reason: '', streak: 0, added: now, lastAttempt: now, lastOutcome: 'correct', due: now + DAY };
        if (el.hasAttribute('data-note')) it.note = el.value; else it.reason = el.value;
        it.updatedAt = now; book[id] = it;
        store.set('notebook', book);
        var status = app.querySelector('[data-note-status="' + id + '"]');
        if (status) status.textContent = 'Catatan tersimpan.';
      };
    });
  }

  // ---------- views ----------
  var timerHandle = null;
  function clearTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  var activeFlush = null, keyHandler = null; // set while the exam view is open
  document.addEventListener('keydown', function (e) { if (keyHandler) keyHandler(e); });
  document.addEventListener('visibilitychange', function () { if (activeFlush) activeFlush(document.hidden); });
  window.addEventListener('pagehide', function () { if (activeFlush) activeFlush(true); });

  // The top bar is the same test switcher on every page. The SIMAK link keeps class "sm-navlink" so
  // js/simak.js recognises it (and marks it current) instead of injecting a second one.
  var NAV = document.querySelector('.topbar nav');
  function setNav(ctx) {
    if (!NAV) return;
    NAV.innerHTML = '<a href="#/simak" class="sm-navlink">SIMAK</a>' +
      '<a href="#/neuro"' + (ctx === 'neuro' ? ' aria-current="page"' : '') + '>CBT Neurologi</a>';
  }

  // Section links inside CBT Neurologi, mirroring the SIMAK sub-navigation.
  function subnav(cur) {
    return '<nav class="subnav">' + [['neuro', 'Ringkasan'], ['setup', 'Try Out'], ['kesalahan', 'Buku kesalahan'], ['materi', 'Materi'], ['progres', 'Progres']].map(function (l) {
      return '<a href="#/' + l[0] + '"' + (l[0] === cur ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
    }).join('') + '</nav>';
  }
  function pageHead(eyebrow, title, lead) {
    return '<header class="page-head"><span class="eyebrow">' + eyebrow + '</span><h1>' + title + '</h1>' + (lead ? '<p>' + lead + '</p>' : '') + '</header>';
  }

  function readSimak(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem('npx.simak.' + key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }

  // Landing: choose a test. SIMAK first, then CBT Neurologi. The SIMAK card uses id "sm-home-entry"
  // so js/simak.js does not add its own homepage tile.
  function viewLanding() {
    var nAtt = store.get('attempts', []), nCur = store.get('current', null), nLast = nAtt[nAtt.length - 1];
    var sAtt = readSimak('attempts', []), sCur = readSimak('current', null);
    var html = pageHead('Seleksi PPDS Neurologi · FKUI', 'Dua tes, satu tempat berlatih.', 'Pilih tes yang ingin dilatih. Progres masing-masing tersimpan di perangkat ini.');
    if (sCur) html += '<div class="notice"><span>Ada sesi SIMAK yang belum selesai.</span><a href="#/simak/exam">Lanjutkan SIMAK →</a></div>';
    if (nCur) html += '<div class="notice"><span>Ada try out CBT Neurologi yang ' + (nCur.pausedAt ? 'dijeda' : 'belum selesai') + '.</span><a href="#/ujian">Lanjutkan try out →</a></div>';
    html += '<div class="link-grid test-cards">' +
      '<a class="card link-card test-card" id="sm-home-entry" href="#/simak">' +
      '<span class="eyebrow">Tes 1</span><h2>SIMAK UI Pascasarjana</h2>' +
      '<p class="muted">PEKA dan Bahasa Inggris, dengan timer dan aturan nilai tiap subtes.</p>' +
      '<div class="test-meta"><span class="pill"><b id="sm-count">' + (window.SIMAK_BANK ? window.SIMAK_BANK.length : '…') + '</b> soal</span><span class="pill"><b>' + sAtt.length + '</b> sesi selesai</span></div>' +
      '<span class="btn">Masuk SIMAK →</span></a>' +
      '<a class="card link-card test-card" href="#/neuro">' +
      '<span class="eyebrow">Tes 2</span><h2>CBT Neurologi</h2>' +
      '<p class="muted">Simulasi CBT PPDS Neurologi FKUI; setiap jawaban berujuk ke halaman Buku Ajar Neurologi.</p>' +
      '<div class="test-meta"><span class="pill"><b>' + POOL.length + '</b> soal</span><span class="pill"><b>' + nAtt.length + '</b> try out</span>' +
      (nLast ? '<span class="pill">skor terakhir <b>' + pct(nLast.correct, nLast.total) + '%</b></span>' : '') + '</div>' +
      '<span class="btn">Masuk CBT Neurologi →</span></a>' +
      '</div>';
    app.innerHTML = html;
    // The SIMAK bank script loads after this file; fill its count once everything has loaded.
    if (!window.SIMAK_BANK) window.addEventListener('load', function () {
      var el = document.getElementById('sm-count');
      if (el) el.textContent = window.SIMAK_BANK ? window.SIMAK_BANK.length : '–';
    }, { once: true });
  }

  function viewHome() {
    var attempts = store.get('attempts', []);
    var last = attempts[attempts.length - 1];
    var current = store.get('current', null);
    var due = queue('due').length;
    var html = subnav('neuro') + pageHead('Ruang latihan · CBT Neurologi', 'Latih soal, pahami rujukannya.',
      'Try out berbobot sesuai pola soal 2023–2026, pembahasan setiap soal, dan pelacakan topik lemah.');
    if (current) {
      html += '<div class="notice"><span>Ada try out yang ' + (current.pausedAt ? 'dijeda' : 'belum selesai') + '.</span><a href="#/ujian">Lanjutkan try out →</a></div>';
    }
    var modes = [['#/setup?mode=simulasi', 'Simulasi', 'Seperti ujian', 'Semua topik sesuai bobot soal lalu, timer 1 menit per soal; pembahasan setelah selesai.'],
      ['#/setup?mode=latihan', 'Latihan', 'Pembahasan per soal', 'Jawab, pilih tingkat keyakinan, lalu buka pembahasan dan rujukan buku langsung.']];
    if (PASTQ.length) modes.push(['#/setup?bank=lama', 'Bank Soal Lama', PASTQ.length + ' soal CBT 2023–2026', 'Per paket sesuai urutan asli, atau acak.']);
    modes.push(['#/kesalahan', 'Buku kesalahan', 'Ulangan terjadwal', 'Soal salah, kosong, dan ragu diulang pada hari ke-1, 3, 7, 14, lalu 30.']);
    modes.push(['#/materi', 'Materi', 'Ringkasan high-yield', 'Per topik, diurutkan menurut frekuensi soal lalu.']);
    modes.push(['#/progres', 'Progres', 'Topik lemah & riwayat', 'Ketepatan pertama kali dan pengulangan per topik, plus cadangan data.']);
    html += '<section class="hero"><div><span class="pill">' + POOL.length + ' soal · ' + TOPICS.length + ' topik · rujukan Buku Ajar</span>' +
      '<h2>Setiap jawaban berujuk ke halaman Buku Ajar Neurologi.</h2>' +
      '<p>Soal dibagi per topik sesuai bobot frekuensi soal lalu; soal yang paling jarang dikerjakan didahulukan, sehingga setiap set berbeda.</p>' +
      '<a class="btn" href="#/setup">Atur try out →</a>' + (PASTQ.length ? '<a class="text-link" href="#/setup?bank=lama">Kerjakan Bank Soal Lama</a>' : '<a class="text-link" href="#/setup?mode=latihan">Mulai latihan singkat</a>') + '</div>' +
      '<div class="hero-facts"><div><strong>' + POOL.length + '</strong><span>soal di Bank Buku Ajar</span></div>' +
      '<div><strong>' + attempts.length + '</strong><span>sesi selesai di perangkat ini</span></div>' +
      '<div><strong>' + (last ? pct(last.correct, last.total) + '%' : '–') + '</strong><span>skor terakhir</span></div></div></section>' +
      '<div class="callout"><div><b>' + due + ' soal jatuh tempo untuk diulang</b><p class="small muted">Salah, kosong, dan ragu dikumpulkan untuk latihan berikutnya.</p></div><a class="btn secondary" href="#/kesalahan">Buka buku kesalahan →</a></div>' +
      '<div class="section-head"><h2>Pilih cara berlatih</h2><span class="muted small">Sesuaikan dengan waktu yang tersedia</span></div>' +
      '<div class="link-grid">' + modes.map(function (m, k) {
        return '<a class="card link-card" href="' + m[0] + '"><span class="eyebrow">0' + (k + 1) + '</span><h3>' + m[1] + '</h3><b class="small">' + m[2] + '</b><p class="muted small">' + m[3] + '</p><span class="arrow" aria-hidden="true">↗</span></a>';
      }).join('') + '</div>' +
      '<div class="info small"><b>Tentang rujukan.</b><p>Setiap soal di Bank Buku Ajar memiliki rujukan halaman Buku Ajar Neurologi Ed. 2 (FKUI) yang mendukung jawabannya. Rujukan menunjukkan sumber, bukan jaminan bebas salah. Soal di luar buku hanya muncul bila opsi <b>Sertakan soal di luar Buku Ajar</b> diaktifkan, dan selalu diberi label. Jika ada soal yang meragukan, tekan <b>Laporkan soal</b> di halaman pembahasan.</p></div>';
    app.innerHTML = html;
  }

  function viewSetup(params) {
    var last = store.get('lastSettings', null);
    var preset = params.topic ? [params.topic] : (last && last.topics && last.topics.length ? last.topics : TOPICS.map(function (t) { return t.id; }));
    var n = last ? last.n : 50;
    var mode = params.mode || (last && last.mode) || 'simulasi';
    var timed = params.mode === 'latihan' ? false : last ? last.timed : true;
    var rhythm = (last && last.rhythm) || 'flexible';
    var outside = last ? !!last.outside : false;
    var counts = {}, extra = {};
    POOL.forEach(function (q) { counts[q.t] = (counts[q.t] || 0) + 1; });
    OUTSIDE.forEach(function (q) { extra[q.t] = (extra[q.t] || 0) + 1; });
    var bank = params.bank || (last && last.bank) || 'buku';
    if (!PASTQ.length || bank === 'review') bank = 'buku';
    var paper = (last && last.paper) || 'all', order = (last && last.order) || 'acak';
    function opt(v, label, cur) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>'; }
    var html = subnav('setup') + pageHead('Try out · CBT Neurologi', 'Atur try out.', 'Pilih mode, sumber soal, jumlah, waktu dan topik. Pengaturan terakhir diingat.') +
      '<div class="setup-grid"><div class="card"><h2>Pengaturan</h2>' +
      '<div class="field"><span>Mode</span><select id="mode">' +
      opt('simulasi', 'Simulasi — pembahasan setelah selesai', mode) + opt('latihan', 'Latihan — pembahasan bisa dibuka per soal', mode) +
      '</select></div>' +
      '<div class="field"><span>Sumber soal</span><select id="bank">' +
      '<option value="buku"' + (bank === 'buku' ? ' selected' : '') + '>Bank Buku Ajar (' + POOL.length + ' soal)</option>' +
      (PASTQ.length ? '<option value="lama"' + (bank === 'lama' ? ' selected' : '') + '>Bank Soal Lama — soal CBT tahun lalu (' + PASTQ.length + ' soal)</option>' : '') +
      '</select></div>' +
      '<div id="lama-opts"' + (bank === 'lama' ? '' : ' hidden') + '>' +
      '<div class="field"><span>Paket</span><select id="paper"><option value="all">Semua paket</option>' +
      PAPERS.map(function (pp) {
        var c = PASTQ.filter(function (q) { return q.past.paper === pp; }).length;
        return '<option value="' + esc(pp) + '"' + (pp === paper ? ' selected' : '') + '>' + esc(pp) + ' (' + c + ' soal)</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><span>Urutan</span><select id="order">' +
      opt('acak', 'Acak (sesuai jumlah soal)', order) + opt('urut', 'Satu paket utuh, urut nomor asli', order) +
      '</select></div></div>' +
      '<div class="field"><span>Jumlah soal</span><select id="n">' +
      [10, 25, 50, 75, 100].map(function (v) { return '<option' + (v === n ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><span>Waktu</span><select id="timed">' +
      '<option value="60"' + (timed ? ' selected' : '') + '>1 menit per soal</option>' +
      '<option value="0"' + (!timed ? ' selected' : '') + '>Tanpa batas waktu</option>' +
      '</select></div>' +
      '<div class="field" id="rhythm-wrap"' + (mode === 'latihan' ? ' hidden' : '') + '><span>Ritme</span><select id="rhythm">' +
      opt('flexible', 'Fleksibel — bisa dijeda', rhythm) + opt('exam', 'Mode ujian — timer terus berjalan, tanpa jeda', rhythm) +
      '</select></div>' +
      '<label class="check" id="outside-wrap"' + (bank === 'lama' ? ' hidden' : '') + '><input type="checkbox" id="outside"' + (outside ? ' checked' : '') + '>' +
      '<span><b>Sertakan soal di luar Buku Ajar</b><br><span class="small muted">' + OUTSIDE.length + ' soal (terutama neuroanatomi dan serebelum) yang jawabannya tidak ditemukan di Buku Ajar Neurologi. Ditandai jelas saat pembahasan.</span></span></label>' +
      '<p class="small muted" id="mode-hint"></p>' +
      '<button class="btn" id="go">Mulai →</button><p class="inline-error" id="err" role="alert"></p></div>' +
      '<div class="card"><div class="row spread"><h2>Topik</h2><span class="row small"><a href="javascript:void 0" id="all">Pilih semua</a><a href="javascript:void 0" id="none">Kosongkan</a></span></div>' +
      '<div class="topic-list">' + TOPICS.map(function (t) {
        return '<label class="check"><input type="checkbox" value="' + t.id + '"' + (preset.indexOf(t.id) >= 0 ? ' checked' : '') + '>' +
          '<span>' + esc(t.name) + ' <span class="muted small">(' + (counts[t.id] || 0) + ' soal' +
          (extra[t.id] ? '<span class="outside-count"' + (outside ? '' : ' hidden') + '> + ' + extra[t.id] + ' di luar buku</span>' : '') +
          ')</span></span></label>';
      }).join('') + '</div></div></div>';
    app.innerHTML = html;
    var boxes = app.querySelectorAll('input[type=checkbox]:not(#outside)');
    function hint() {
      var latihan = document.getElementById('mode').value === 'latihan';
      document.getElementById('rhythm-wrap').hidden = latihan;
      document.getElementById('mode-hint').textContent = latihan
        ? 'Latihan: pilih jawaban dan tingkat keyakinan, lalu buka pembahasan per soal. Jawaban dikunci setelah pembahasan dibuka. Bisa dijeda.'
        : 'Soal dibagi per topik sesuai bobot frekuensi soal lalu. Soal yang paling jarang Anda kerjakan diprioritaskan, sehingga setiap set berbeda.';
    }
    hint();
    document.getElementById('mode').onchange = hint;
    document.getElementById('bank').onchange = function (e) {
      var lama = e.target.value === 'lama';
      document.getElementById('lama-opts').hidden = !lama;
      document.getElementById('outside-wrap').hidden = lama;
    };
    document.getElementById('outside').onchange = function (e) {
      app.querySelectorAll('.outside-count').forEach(function (el) { el.hidden = !e.target.checked; });
    };
    document.getElementById('all').onclick = function () { boxes.forEach(function (b) { b.checked = true; }); };
    document.getElementById('none').onclick = function () { boxes.forEach(function (b) { b.checked = false; }); };
    document.getElementById('go').onclick = function () {
      var err = document.getElementById('err');
      var topics = [];
      boxes.forEach(function (b) { if (b.checked) topics.push(b.value); });
      if (!topics.length) { err.textContent = 'Pilih minimal satu topik.'; return; }
      var sec = parseInt(document.getElementById('timed').value, 10);
      var settings = { n: parseInt(document.getElementById('n').value, 10), timed: sec > 0, secPerQ: sec || 60, topics: topics,
        mode: document.getElementById('mode').value,
        rhythm: document.getElementById('rhythm').value,
        outside: document.getElementById('outside').checked,
        bank: document.getElementById('bank').value,
        paper: document.getElementById('paper') ? document.getElementById('paper').value : 'all',
        order: document.getElementById('order') ? document.getElementById('order').value : 'acak' };
      confirmReplace(function () { if (!startExam(settings)) err.textContent = 'Tidak ada soal untuk topik yang dipilih.'; });
    };
  }

  function viewExam() {
    var exam = store.get('current', null);
    if (!exam) { location.hash = '#/setup'; return; }
    var n = exam.qids.length;
    // Sessions saved before the study features existed.
    if (!exam.conf) exam.conf = fill(n, null);
    if (!exam.revealed) exam.revealed = fill(n, false);
    if (!exam.spent) exam.spent = fill(n, 0);
    if (!exam.created) exam.created = exam.start;
    var study = isStudy(exam.settings), canPause = study || exam.settings.rhythm !== 'exam';
    var segStart = exam.pausedAt ? null : Date.now();

    function remaining() { return exam.limit ? exam.limit - ((exam.pausedAt || Date.now()) - exam.start) / 1000 : null; }
    function save() { store.set('current', exam); }
    // Adds the time since the last checkpoint to the open question; stop=true while hidden or leaving.
    function flush(stop) {
      if (segStart !== null && !exam.pausedAt) exam.spent[exam.cur] += Date.now() - segStart;
      segStart = stop || exam.pausedAt ? null : Date.now();
      save();
    }
    activeFlush = flush;
    function go(k) { flush(); exam.cur = k; save(); render(); window.scrollTo(0, 0); }
    function finish(expired) { flush(true); clearTimer(); activeFlush = null; keyHandler = null; finishExam(exam, expired); }
    function askFinish() {
      var left = exam.answers.filter(function (a) { return a === null; }).length;
      dialog('Selesaikan ' + modeName(exam.settings).toLowerCase() + '?', left ? left + ' soal belum dijawab.' : 'Semua soal sudah dijawab.', 'Selesai & lihat hasil', function () { finish(false); });
    }
    function head() {
      var answered = exam.answers.filter(function (a) { return a !== null; }).length;
      return '<div class="exam-top"><div><span class="eyebrow">CBT Neurologi · ' + modeName(exam.settings) + '</span><div><b>Soal ' + (exam.cur + 1) + '</b> <span class="muted">/ ' + n + '</span>' +
        ' <span class="muted small">· ' + answered + ' terjawab</span></div></div>' +
        '<div class="row">' + (canPause && !exam.pausedAt ? '<button class="btn ghost small" id="pause">Jeda</button>' : '') + '<div class="timer" id="timer"></div></div></div>';
    }

    function render() {
      keyHandler = null;
      if (exam.pausedAt) {
        app.innerHTML = head() + '<div class="card paused"><span class="eyebrow">Dijeda</span><h2>Sesi dijeda.</h2>' +
          '<p class="muted">Soal disembunyikan dan timer berhenti. Jawaban dan sisa waktu tersimpan di perangkat ini, juga bila browser ditutup.</p>' +
          '<div class="row"><button class="btn" id="resume">Lanjutkan →</button><a class="btn secondary" href="#/neuro">Keluar ke ringkasan</a></div></div>';
        document.getElementById('resume').onclick = function () {
          exam.start += Date.now() - exam.pausedAt; exam.pausedAt = null; save(); segStart = Date.now(); render();
        };
        tick();
        return;
      }
      var i = exam.cur, q = QMAP[exam.qids[i]], order = exam.orders[i], ans = exam.answers[i], shown = exam.revealed[i];
      var html = head() + '<div class="exam-layout"><div class="card">' +
        '<div class="stem">' + esc(q.q) + '</div>' +
        order.map(function (oi, k) {
          if (shown) {
            var cls = oi === 0 ? ' correct' : (oi === ans ? ' wrong' : '');
            return '<div class="opt' + cls + '"><span class="key">' + LETTERS[k] + '</span><span>' + esc(q.o[oi]) + (oi === 0 ? ' <b>✓</b>' : oi === ans ? ' <b>✗</b>' : '') + '</span></div>';
          }
          return '<button class="opt' + (ans === oi ? ' sel' : '') + '" data-o="' + oi + '"><span class="key">' + LETTERS[k] + '</span><span>' + esc(q.o[oi]) + '</span></button>';
        }).join('') +
        (ans !== null && !shown ? '<div class="row" style="justify-content:flex-end"><button class="btn ghost small" id="clear">Hapus jawaban</button></div>' : '') +
        (study ? '<div class="confidence" role="group" aria-label="Keyakinan"><span class="small muted">Keyakinan</span>' +
          [['yakin', 'Yakin'], ['ragu', 'Ragu'], ['tebak', 'Menebak']].map(function (c) {
            return '<button class="choice' + (exam.conf[i] === c[0] ? ' on' : '') + '" data-c="' + c[0] + '"' + (shown ? ' disabled' : '') + '>' + c[1] + '</button>';
          }).join('') + '</div>' +
          (shown ? expHTML(q) + '<div class="small" style="margin-top:10px">' + sourceHTML(q) + '</div>'
            : '<button class="btn secondary small" id="reveal"' + (ans === null ? ' disabled' : '') + '>Lihat pembahasan</button> <span class="small muted">Jawaban dikunci setelah pembahasan dibuka.</span>') : '') +
        '<div class="exam-actions">' +
        '<button class="btn ghost" id="prev"' + (i === 0 ? ' disabled' : '') + '>← Sebelumnya</button>' +
        '<label class="check small"><input type="checkbox" id="flag"' + (exam.flags[i] ? ' checked' : '') + '> Ragu-ragu</label>' +
        (i < n - 1 ? '<button class="btn" id="next">Berikutnya →</button>' : '<button class="btn" id="submit2">Selesai</button>') +
        '</div></div>' +
        '<aside class="card exam-side"><h2>Navigasi soal</h2>' +
        '<div class="legend"><span><i class="l-ans"></i>Terjawab</span><span><i class="l-flag"></i>Ragu-ragu</span>' + (study ? '<span><i class="l-ok"></i>Benar</span><span><i class="l-bad"></i>Salah</span>' : '') + '</div>' +
        '<div class="nav-grid">' +
        exam.qids.map(function (_, k) {
          var c = (k === i ? ' cur' : '') + (exam.revealed[k] ? (exam.answers[k] === 0 ? ' ok' : ' bad') : exam.flags[k] ? ' flag' : exam.answers[k] !== null ? ' ans' : '');
          return '<button class="' + c + '" data-k="' + k + '">' + (k + 1) + '</button>';
        }).join('') +
        '</div><button class="btn secondary" id="submit">Selesai & lihat hasil</button>' +
        '<p class="small muted keys">Pintasan: A–E memilih jawaban, ← → berpindah soal.</p></aside></div>';
      app.innerHTML = html;

      function choose(oi) { exam.answers[i] = oi; save(); render(); }
      app.querySelectorAll('button.opt').forEach(function (b) {
        b.onclick = function () { choose(parseInt(b.getAttribute('data-o'), 10)); };
      });
      app.querySelectorAll('[data-c]').forEach(function (b) {
        b.onclick = function () { var c = b.getAttribute('data-c'); exam.conf[i] = exam.conf[i] === c ? null : c; save(); render(); };
      });
      var reveal = document.getElementById('reveal');
      if (reveal) reveal.onclick = function () { exam.revealed[i] = true; save(); render(); };
      var clear = document.getElementById('clear');
      if (clear) clear.onclick = function () { exam.answers[i] = null; save(); render(); };
      app.querySelectorAll('.nav-grid button').forEach(function (b) {
        b.onclick = function () { go(parseInt(b.getAttribute('data-k'), 10)); };
      });
      document.getElementById('flag').onchange = function (e) { exam.flags[i] = e.target.checked; save(); render(); };
      var prev = document.getElementById('prev');
      if (prev) prev.onclick = function () { go(i - 1); };
      var next = document.getElementById('next');
      if (next) next.onclick = function () { go(i + 1); };
      document.getElementById('submit').onclick = askFinish;
      var s2 = document.getElementById('submit2');
      if (s2) s2.onclick = askFinish;
      var pause = document.getElementById('pause');
      if (pause) pause.onclick = function () { flush(true); exam.pausedAt = Date.now(); exam.pauseCount = (exam.pauseCount || 0) + 1; save(); render(); };
      keyHandler = function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.getElementById('nx-dialog')) return;
        var k = e.key.length === 1 ? LETTERS.indexOf(e.key.toUpperCase()) : -1;
        if (k >= 0 && k < order.length && !shown) { e.preventDefault(); choose(order[k]); }
        else if (e.key === 'ArrowRight' && i < n - 1) { e.preventDefault(); go(i + 1); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); go(i - 1); }
      };
      tick();
    }

    function tick() {
      var el = document.getElementById('timer');
      if (!el) return;
      var r = remaining();
      if (r === null) { el.textContent = '⏱ ' + fmtTime(((exam.pausedAt || Date.now()) - exam.start) / 1000); return; }
      el.textContent = '⏱ ' + fmtTime(r);
      el.className = 'timer' + (r < 300 ? ' low' : '');
      if (r <= 0 && !exam.pausedAt) finish(true);
    }

    clearTimer();
    timerHandle = setInterval(tick, 1000);
    render();
  }

  function accuracy(c, total) { return total ? pct(c, total) + '% <span class="small muted">(' + c + '/' + total + ')</span>' : '<span class="muted">–</span>'; }
  function topicTable(byTopic) {
    var rows = Object.keys(byTopic).sort(function (a, b) {
      return pct(byTopic[a].c, byTopic[a].n) - pct(byTopic[b].c, byTopic[b].n);
    });
    return '<div class="table-wrap"><table><tr><th>Topik</th><th>Benar</th><th style="width:35%">Skor</th></tr>' +
      rows.map(function (t) {
        var s = byTopic[t], p = pct(s.c, s.n);
        return '<tr><td>' + esc(TOPIC[t] ? TOPIC[t].name : t) + '</td><td>' + s.c + '/' + s.n + '</td>' +
          '<td><div class="bar ' + barClass(p) + '"><i style="width:' + p + '%"></i></div><span class="small">' + p + '%</span></td></tr>';
      }).join('') + '</table></div>';
  }

  function viewResult(id) {
    var attempts = store.get('attempts', []);
    var a = null;
    for (var i = 0; i < attempts.length; i++) if (attempts[i].id === id) a = attempts[i];
    if (!a) { app.innerHTML = subnav('') + '<div class="card">Hasil tidak ditemukan. <a href="#/progres">Lihat riwayat</a>.</div>'; return; }
    var reported = store.get('reported', {});
    var filter = 'all';
    var p = pct(a.correct, a.total);
    var spent = a.spent || [], hasTime = spent.some(function (x) { return x > 0; });
    function slow(k) { return a.answers[k] === 0 && spent[k] > REF_MS * 1.5; }
    function fast(k) { return a.answers[k] !== null && a.answers[k] !== 0 && spent[k] > 0 && spent[k] < REF_MS * 0.5; }
    var nSlow = 0, nFast = 0, active = 0;
    a.qids.forEach(function (_, k) { if (slow(k)) nSlow++; if (fast(k)) nFast++; active += spent[k] || 0; });
    var CONF = { yakin: 'yakin', ragu: 'ragu', tebak: 'menebak' };

    function render() {
      var name = modeName(a.settings);
      var html = subnav('') + pageHead('Hasil · CBT Neurologi', 'Hasil ' + name.toLowerCase() + '.',
        fmtDate(a.date) + ' · waktu aktif ' + fmtTime(a.duration) + (a.pauseCount ? ' · ' + a.pauseCount + ' kali jeda' : '') + (a.expired ? ' · waktu habis' : '')) +
        '<div class="grid"><div class="card"><span class="eyebrow">Skor</span><div class="stat">' + p + '%</div><div class="small muted">' + a.correct + ' dari ' + a.total + ' benar</div></div>' +
        '<div class="card"><span class="eyebrow">Tidak dijawab</span><div class="stat">' + a.answers.filter(function (x) { return x === null; }).length + '</div></div>' +
        '<div class="card"><span class="eyebrow">Ditandai ragu</span><div class="stat">' + a.flags.filter(Boolean).length + '</div></div></div>' +
        (isStudy(a.settings) ? '<p class="info small">' + name + ' dapat membuka pembahasan saat pengerjaan; hasilnya tidak dihitung pada kolom “Simulasi saja” di Progres.</p>' : '') +
        '<div class="row" style="margin-top:18px">' +
        (a.settings.review ? '<a class="btn" href="#/kesalahan">Ulang soal lain</a>' : '<button class="btn" id="again">Coba Set Lain</button><a class="btn secondary" href="#/setup">Ubah pengaturan</a>') +
        '<a class="btn secondary" href="#/kesalahan">Buku kesalahan</a><button class="btn ghost" id="dl">Unduh hasil</button></div>' +
        (hasTime ? '<section class="card"><h2 style="margin-top:0">Ritme</h2><div class="row"><span class="pill">Waktu aktif ' + fmtMs(active) + '</span>' +
          '<span class="pill">' + nSlow + ' benar di atas 1,5 menit</span><span class="pill">' + nFast + ' salah di bawah 30 detik</span></div>' +
          '<p class="small muted">Acuan 1 menit per soal. Soal di atas 1,5× atau di bawah 0,5× acuan ditandai untuk ditinjau; ini bukan batas waktu per soal.</p></section>' : '') +
        '<h2>Per topik</h2><div class="card">' + topicTable(a.byTopic) + '</div>' +
        '<div class="section-head"><h2>Pembahasan</h2><div class="tabs">' +
        [['all', 'Semua'], ['wrong', 'Salah / kosong'], ['flag', 'Ragu-ragu']].concat(hasTime ? [['slow', 'Benar lambat'], ['fast', 'Salah cepat']] : []).map(function (f) {
          return '<button data-f="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
        }).join('') + '</div></div>';
      var matched = 0;
      a.qids.forEach(function (qid, i) {
        var q = QMAP[qid];
        if (!q) return;
        var ans = a.answers[i], ok = ans === 0;
        if (filter === 'wrong' && ok) return;
        if (filter === 'flag' && !a.flags[i]) return;
        if (filter === 'slow' && !slow(i)) return;
        if (filter === 'fast' && !fast(i)) return;
        matched++;
        var status = '<span class="tag ' + (ok ? 'ok' : ans === null ? 'warn' : 'bad') + '">' + (ok ? 'Benar' : ans === null ? 'Tidak dijawab' : 'Salah') + (a.flags[i] ? ' · Ragu' : '') + '</span>';
        var meta = [];
        if (spent[i]) meta.push('Waktu aktif ' + fmtMs(spent[i]));
        if (a.conf && a.conf[i]) meta.push('Keyakinan: ' + CONF[a.conf[i]]);
        if (a.revealed && a.revealed[i]) meta.push('pembahasan dibuka saat latihan');
        html += '<article class="card"><div class="row spread"><div class="qtopic">' + (i + 1) + '. ' + qLabel(q) + '</div>' + status + '</div>' +
          '<div class="stem">' + esc(q.q) + '</div>' +
          a.orders[i].map(function (oi, k) {
            var cls = oi === 0 ? ' correct' : (oi === ans ? ' wrong' : '');
            var mark = oi === 0 ? ' ✓' : (oi === ans ? ' ✗ (jawaban Anda)' : '');
            return '<div class="opt' + cls + '"><span class="key">' + LETTERS[k] + '</span><span>' + esc(q.o[oi]) + '<b>' + mark + '</b></span></div>';
          }).join('') +
          expHTML(q) +
          (meta.length ? '<p class="small muted">' + meta.join(' · ') + '</p>' : '') +
          notesHTML(qid) +
          '<div class="row spread small" style="margin-top:12px">' + sourceHTML(q) +
          '<button class="btn ghost small" data-r="' + qid + '">' + (reported[qid] ? 'Dilaporkan ✓' : 'Laporkan soal') + '</button></div></article>';
      });
      if (!matched) html += '<div class="card">Tidak ada soal pada filter ini.</div>';
      app.innerHTML = html;
      var again = document.getElementById('again');
      if (again) again.onclick = function () {
        confirmReplace(function () { if (!startExam(a.settings)) dialog('Tidak ada soal', 'Tidak ada soal untuk pengaturan ini.', 'Tutup'); });
      };
      document.getElementById('dl').onclick = function () { download('neuro-hasil-' + a.id + '.json', a); };
      app.querySelectorAll('.tabs button').forEach(function (b) {
        b.onclick = function () { filter = b.getAttribute('data-f'); render(); };
      });
      app.querySelectorAll('[data-r]').forEach(function (b) {
        b.onclick = function () {
          var qid = b.getAttribute('data-r');
          if (reported[qid]) { delete reported[qid]; store.set('reported', reported); render(); return; }
          dialog('Laporkan soal', 'Apa yang salah dari soal ini? (opsional)', 'Laporkan', function (note) {
            reported[qid] = { note: note || '', date: Date.now() };
            store.set('reported', reported);
            render();
          }, true);
        };
      });
      wireNotes();
    }
    render();
  }

  function viewNotebook(filter) {
    if (['due', 'all', 'wrong', 'uncertain'].indexOf(filter) < 0) filter = 'due';
    var book = store.get('notebook', {}), ids = queue(filter), now = Date.now();
    var total = Object.keys(book).filter(function (id) { return QMAP[id]; }).length;
    var OUT = { wrong: 'salah', blank: 'tidak dijawab', uncertain: 'benar tapi ragu', correct: 'benar' };
    var html = subnav('kesalahan') + pageHead('Buku kesalahan · CBT Neurologi', 'Belajar dari yang belum mantap.',
      'Soal salah, kosong, dan ragu masuk ke daftar ulasan. Catat penyebabnya, lalu ulang sesuai jadwal.') +
      '<div class="tabs">' + [['due', 'Jatuh tempo'], ['all', 'Semua'], ['wrong', 'Salah / kosong'], ['uncertain', 'Benar tapi ragu']].map(function (f) {
        return '<a href="#/kesalahan/' + f[0] + '"' + (f[0] === filter ? ' class="on" aria-current="page"' : '') + '>' + f[1] + '</a>';
      }).join('') + '</div>' +
      '<div class="callout"><div><b>' + ids.length + ' soal pada daftar ini</b><p class="small muted">Total catatan: ' + total + '. Jawaban benar yang diulang kurang dari 12 jam setelahnya tidak memperpanjang jadwal.</p></div>' +
      '<div class="row"><label class="field"><span>Jumlah</span><select id="rn"><option value="10">10 soal</option><option value="20">20 soal</option><option value="all">Semua pada daftar</option></select></label>' +
      '<button class="btn" id="start-review"' + (ids.length ? '' : ' disabled') + '>Mulai ulangan</button></div></div>' +
      '<p class="small muted">Jadwal: 1, 3, 7, 14, lalu 30 hari setelah jawaban benar yang yakin. Ulangan tanpa timer dan pembahasan bisa dibuka per soal. Ini pengingat latihan, bukan ukuran penguasaan resmi.</p>';
    if (!ids.length) {
      html += '<div class="card">' + (total ? 'Tidak ada soal pada daftar ini. <a href="#/kesalahan/all">Lihat semua catatan</a>.' : 'Belum ada catatan. Selesaikan try out atau latihan untuk mengumpulkan soal yang perlu ditinjau.') + '</div>';
    }
    ids.forEach(function (id) {
      var it = book[id], q = QMAP[id];
      html += '<article class="card"><div class="row spread"><span class="qtopic">' + qLabel(q) + '</span>' +
        '<span class="tag' + (it.due <= now ? ' warn' : '') + '">' + (it.due <= now ? 'Jatuh tempo' : 'Ulang ' + fmtDay(it.due)) + '</span></div>' +
        '<div class="stem">' + esc(q.q) + '</div>' +
        '<p class="small muted">Terakhir: ' + (OUT[it.lastOutcome] || '–') + (it.lastAttempt ? ', ' + fmtDay(it.lastAttempt) : '') + '</p>' +
        notesHTML(id) +
        '<details class="notes"><summary>Lihat jawaban dan pembahasan</summary><p><b>Jawaban:</b> ' + esc(q.o[0]) + '</p>' + expHTML(q) +
        '<div class="small" style="margin-top:10px">' + sourceHTML(q) + '</div></details>' +
        '<button class="link-button" data-remove="' + id + '">Keluarkan dari daftar ulasan</button></article>';
    });
    app.innerHTML = html;
    document.getElementById('start-review').onclick = function () {
      var v = document.getElementById('rn').value;
      var list = ids.slice(0, v === 'all' ? ids.length : parseInt(v, 10)).map(function (id) { return QMAP[id]; });
      confirmReplace(function () {
        startExam({ mode: 'latihan', review: true, bank: 'review', timed: false, secPerQ: 60, n: list.length, topics: [] }, list);
      });
    };
    app.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () {
        var latest = store.get('notebook', {});
        delete latest[b.getAttribute('data-remove')];
        store.set('notebook', latest);
        viewNotebook(filter);
      };
    });
    wireNotes();
  }

  // ---------- backup ----------
  function validBackup(x) {
    function fail(m) { throw new Error('Cadangan tidak valid: ' + m + '.'); }
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function checkRun(a, what) {
      if (!isObj(a) || !Array.isArray(a.qids) || !Array.isArray(a.answers) || !Array.isArray(a.orders) || !Array.isArray(a.flags)) fail(what + ' rusak');
      if (a.answers.length !== a.qids.length || a.orders.length !== a.qids.length || a.flags.length !== a.qids.length) fail(what + ' tidak lengkap');
      a.qids.forEach(function (id) { if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(id)) fail('ID soal'); });
      a.answers.forEach(function (v) { if (v !== null && !(Number.isInteger(v) && v >= 0 && v < 5)) fail('jawaban'); });
      a.orders.forEach(function (o) { if (!Array.isArray(o) || !o.every(function (v) { return Number.isInteger(v) && v >= 0 && v < 5; })) fail('urutan pilihan'); });
      if (!isObj(a.settings)) fail('pengaturan');
    }
    if (!isObj(x) || x.schema !== 'neuro-backup-v1') fail('bukan berkas cadangan CBT Neurologi dari aplikasi ini');
    if (!Array.isArray(x.attempts)) fail('riwayat');
    x.attempts.forEach(function (a) {
      checkRun(a, 'riwayat');
      if (typeof a.id !== 'string' || !/^[a-z0-9]{1,20}$/i.test(a.id) || typeof a.date !== 'number' || typeof a.correct !== 'number' || typeof a.total !== 'number' || !isObj(a.byTopic)) fail('riwayat');
    });
    if (x.current !== null && x.current !== undefined) { checkRun(x.current, 'sesi aktif'); if (typeof x.current.start !== 'number') fail('sesi aktif'); }
    if (!isObj(x.notebook)) fail('buku kesalahan');
    Object.keys(x.notebook).forEach(function (id) {
      var it = x.notebook[id];
      if (!/^[A-Za-z0-9-]{1,40}$/.test(id) || !isObj(it) || typeof it.due !== 'number' || (it.note !== undefined && typeof it.note !== 'string')) fail('buku kesalahan');
    });
    if (!isObj(x.reported)) fail('laporan soal');
    return x;
  }
  function backupHTML() {
    var lastBackup = store.get('backupDate', null);
    return '<section class="card"><h2 style="margin-top:0">Cadangkan & pulihkan</h2>' +
      '<p class="small muted">Cadangan CBT Neurologi mencakup riwayat, sesi aktif, buku kesalahan beserta catatan, dan laporan soal. Gunakan untuk pindah perangkat atau sebelum membersihkan browser. Progres SIMAK punya cadangan sendiri di Progres SIMAK.</p>' +
      '<button class="btn secondary" id="export">Unduh cadangan</button>' +
      '<p class="small muted">Cadangan terakhir: ' + (lastBackup ? fmtDate(lastBackup) : 'belum pernah') + '</p><hr>' +
      '<label class="field"><span>Berkas cadangan JSON</span><input type="file" id="import-file" accept=".json,application/json"></label>' +
      '<label class="field"><span>Cara memulihkan</span><select id="import-mode"><option value="merge">Gabungkan dengan progres sekarang</option><option value="replace">Ganti progres sekarang</option></select></label>' +
      '<div id="import-preview" class="small" role="status"></div>' +
      '<button class="btn" id="import" disabled>Impor cadangan</button><p class="inline-error" id="import-error" role="alert"></p></section>';
  }
  function wireBackup() {
    document.getElementById('export').onclick = function () {
      var now = Date.now();
      download('neuro-backup-' + now + '.json', { schema: 'neuro-backup-v1', date: now,
        attempts: store.get('attempts', []), current: store.get('current', null), notebook: store.get('notebook', {}),
        reported: store.get('reported', {}), lastSettings: store.get('lastSettings', null) });
      store.set('backupDate', now);
      viewProgress();
    };
    var imported = null;
    document.getElementById('import-file').onchange = function (e) {
      imported = null;
      document.getElementById('import').disabled = true;
      document.getElementById('import-error').textContent = '';
      document.getElementById('import-preview').textContent = '';
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { document.getElementById('import-error').textContent = 'Berkas melebihi 20 MB.'; return; }
      file.text().then(function (text) {
        imported = validBackup(JSON.parse(text));
        document.getElementById('import-preview').textContent = imported.attempts.length + ' sesi selesai · ' + Object.keys(imported.notebook).length + ' catatan · ' +
          (imported.current ? 'ada sesi aktif' : 'tanpa sesi aktif') + '. Berkas berhasil diperiksa.';
        document.getElementById('import').disabled = false;
      }).catch(function (err) {
        imported = null;
        document.getElementById('import-error').textContent = err instanceof SyntaxError ? 'Berkas bukan JSON yang valid.' : err.message;
      });
    };
    document.getElementById('import').onclick = function () {
      if (!imported) return;
      var replace = document.getElementById('import-mode').value === 'replace';
      function apply() {
        var attempts, notebook, reported, current;
        if (replace) {
          attempts = imported.attempts; notebook = imported.notebook; reported = imported.reported; current = imported.current || null;
        } else {
          var byId = {};
          store.get('attempts', []).concat(imported.attempts).forEach(function (a) { if (!byId[a.id]) byId[a.id] = a; });
          attempts = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.date - b.date; });
          notebook = store.get('notebook', {});
          Object.keys(imported.notebook).forEach(function (id) {
            var it = imported.notebook[id];
            if (!notebook[id] || (it.updatedAt || 0) > (notebook[id].updatedAt || 0)) notebook[id] = it;
          });
          reported = Object.assign({}, imported.reported, store.get('reported', {}));
          current = store.get('current', null) || imported.current || null; // keep this device's unfinished session
        }
        var stats = rebuildStats(attempts);
        store.set('attempts', attempts); store.set('notebook', notebook); store.set('reported', reported); store.set('current', current);
        store.set('seen', stats.seen); store.set('qstats', stats.qstats);
        if (!store.get('lastSettings', null) && imported.lastSettings) store.set('lastSettings', imported.lastSettings);
        viewProgress();
        document.getElementById('import-preview').textContent = 'Cadangan berhasil ' + (replace ? 'dipulihkan.' : 'digabungkan.');
      }
      if (replace) dialog('Ganti progres CBT Neurologi?', imported.attempts.length + ' sesi dan ' + Object.keys(imported.notebook).length + ' catatan dari cadangan akan menggantikan progres di perangkat ini.', 'Ganti dengan cadangan', apply);
      else apply();
    };
  }

  function viewProgress() {
    var attempts = store.get('attempts', []).slice().sort(function (a, b) { return a.date - b.date; });
    var qstats = store.get('qstats', {});
    var reported = store.get('reported', {});
    var byTopic = {}, agg = {}, met = {};
    Object.keys(qstats).forEach(function (id) {
      var q = QMAP[id];
      if (!q) return;
      var b = byTopic[q.t] || (byTopic[q.t] = { n: 0, c: 0 });
      b.n += qstats[id].n; b.c += qstats[id].c;
    });
    // First encounter vs repeats, and timed simulations only (practice and review excluded).
    attempts.forEach(function (a) {
      a.qids.forEach(function (id, i) {
        var q = QMAP[id];
        if (!q) return;
        var s = agg[q.t] || (agg[q.t] = { f: 0, fc: 0, r: 0, rc: 0, s: 0, sc: 0 }), ok = a.answers[i] === 0;
        if (met[id]) { s.r++; if (ok) s.rc++; } else { met[id] = true; s.f++; if (ok) s.fc++; }
        if (!isStudy(a.settings)) { s.s++; if (ok) s.sc++; }
      });
    });
    var coverage = Object.keys(qstats).filter(function (id) { return QMAP[id]; }).length;

    var html = subnav('progres') + pageHead('Progres · CBT Neurologi', 'Lihat perkembangan Anda.', 'Penguasaan per topik dan riwayat try out, tersimpan terpisah dari SIMAK di browser ini.');
    if (!attempts.length) {
      app.innerHTML = html + '<div class="card">Belum ada try out. <a href="#/setup">Mulai sekarang</a>.</div>' + backupHTML();
      wireBackup();
      return;
    }
    var weak = Object.keys(byTopic).filter(function (t) { return byTopic[t].n >= 3; })
      .sort(function (x, y) { return pct(byTopic[x].c, byTopic[x].n) - pct(byTopic[y].c, byTopic[y].n); }).slice(0, 3);
    html += '<div class="grid"><div class="card"><span class="eyebrow">Sesi selesai</span><div class="stat">' + attempts.length + '</div></div>' +
      '<div class="card"><span class="eyebrow">Soal unik dikerjakan</span><div class="stat">' + coverage + '<span class="small muted"> / ' + POOL.length + '</span></div></div>' +
      '<div class="card"><span class="eyebrow">Rata-rata 3 terakhir</span><div class="stat">' +
      Math.round(attempts.slice(-3).reduce(function (s, a) { return s + pct(a.correct, a.total); }, 0) / Math.min(3, attempts.length)) + '%</div></div></div>';
    if (weak.length) {
      html += '<h2>Topik terlemah</h2><div class="card">' + weak.map(function (t) {
        return '<div class="weak-row"><span>' + esc(TOPIC[t].name) + ' — <b>' + pct(byTopic[t].c, byTopic[t].n) + '%</b></span>' +
          '<span class="row"><a href="#/materi/' + t + '">Materi</a><a class="btn secondary small" href="#/setup?topic=' + t + '">Latihan topik ini</a></span></div>';
      }).join('') + '</div>';
    }
    var rows = Object.keys(byTopic).sort(function (a, b) { return pct(byTopic[a].c, byTopic[a].n) - pct(byTopic[b].c, byTopic[b].n); });
    html += '<h2>Ketepatan per topik</h2><div class="card table-wrap"><table><tr><th>Topik</th><th style="width:22%">Semua</th><th>Pertama kali</th><th>Pengulangan</th><th>Simulasi saja</th></tr>' +
      rows.map(function (t) {
        var s = agg[t] || { f: 0, fc: 0, r: 0, rc: 0, s: 0, sc: 0 }, b = byTopic[t], p = pct(b.c, b.n);
        return '<tr><td>' + esc(TOPIC[t] ? TOPIC[t].name : t) + (s.f && s.f < 10 ? '<div class="small muted">Sampel masih sedikit</div>' : '') + '</td>' +
          '<td><div class="bar ' + barClass(p) + '"><i style="width:' + p + '%"></i></div><span class="small">' + p + '% (' + b.c + '/' + b.n + ')</span></td>' +
          '<td>' + accuracy(s.fc, s.f) + '</td><td>' + accuracy(s.rc, s.r) + '</td><td>' + accuracy(s.sc, s.s) + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="small muted">Pertama kali = pertemuan pertama dengan soal itu. Simulasi saja mengecualikan latihan dan ulangan buku kesalahan.</p>';
    html += '<h2>Riwayat</h2><div class="card table-wrap"><table><tr><th>Tanggal</th><th>Mode</th><th>Soal</th><th>Skor</th><th></th></tr>' +
      attempts.slice().reverse().map(function (a) {
        return '<tr><td>' + fmtDate(a.date) + '</td><td>' + modeName(a.settings) + '</td><td>' + a.total + '</td><td>' + pct(a.correct, a.total) + '%</td><td><a href="#/hasil/' + a.id + '">Lihat</a></td></tr>';
      }).join('') + '</table></div>';
    var rep = Object.keys(reported);
    if (rep.length) {
      html += '<h2>Soal yang dilaporkan</h2><div class="card"><p class="small muted">Salin teks di bawah ini dan kirimkan untuk diperiksa.</p>' +
        '<textarea readonly style="min-height:120px;font-size:.85rem">' +
        esc(rep.map(function (id) { return id + ' | ' + (QMAP[id] ? QMAP[id].q.slice(0, 80) : '?') + ' | ' + (reported[id].note || ''); }).join('\n')) +
        '</textarea></div>';
    }
    html += backupHTML() + '<button class="link-button" id="reset">Hapus semua progres CBT Neurologi di browser ini</button>';
    app.innerHTML = html;
    wireBackup();
    document.getElementById('reset').onclick = function () {
      dialog('Hapus progres CBT Neurologi?', 'Riwayat, sesi aktif, buku kesalahan, dan laporan soal pada browser ini akan dihapus. Unduh cadangan terlebih dahulu jika diperlukan.', 'Hapus progres', function () {
        ['attempts', 'seen', 'qstats', 'current', 'reported', 'notebook'].forEach(function (k) { store.set(k, null); });
        viewProgress();
      });
    };
  }

  function viewMateri(topic) {
    if (topic && MATERI[topic]) {
      var t = TOPIC[topic];
      app.innerHTML = subnav('materi') + '<a class="back" href="#/materi">← Semua topik</a>' +
        pageHead('Materi · CBT Neurologi', esc(t.name), 'Muncul ' + t.past + ' kali dalam 6 paket soal lalu (2023–2026).') +
        '<div class="card materi">' + MATERI[topic] + '</div>' +
        '<a class="btn" href="#/setup?topic=' + topic + '">Latihan soal topik ini</a>';
      return;
    }
    var html = subnav('materi') + pageHead('Materi · CBT Neurologi', 'Ringkasan materi.', 'High-yield per topik, diurutkan berdasarkan frekuensi kemunculan pada soal 2023–2026.') + '<div class="link-grid">';
    var maxPast = Math.max.apply(null, TOPICS.map(function (x) { return x.past; }));
    TOPICS.forEach(function (x) {
      html += '<a class="card tile materi-row" href="#/materi/' + x.id + '"><div class="row spread"><b>' + esc(x.name) + '</b><span class="small muted">' + x.past + ' soal lalu</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(100 * x.past / maxPast) + '%"></i></div></a>';
    });
    app.innerHTML = html + '</div>';
  }

  function route() {
    if (activeFlush) { activeFlush(true); activeFlush = null; }
    keyHandler = null;
    clearTimer();
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var path = parts[0].split('/');
    var params = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    window.scrollTo(0, 0);
    setNav(path[0] === '' ? 'home' : path[0] === 'simak' ? 'simak' : 'neuro');
    switch (path[0]) {
      case '': return viewLanding();
      case 'simak': return; // rendered by js/simak.js
      case 'neuro': return viewHome();
      case 'setup': return viewSetup(params);
      case 'ujian': return viewExam();
      case 'hasil': return viewResult(path[1]);
      case 'kesalahan': return viewNotebook(path[1]);
      case 'progres': return viewProgress();
      case 'materi': return viewMateri(path[1]);
      default: return viewLanding();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
