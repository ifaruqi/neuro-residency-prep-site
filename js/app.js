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
  function startExam(settings) {
    var qs = settings.bank === 'lama' ? pickPast(settings) : pickQuestions(settings.n, settings.topics, !!settings.outside);
    if (!qs.length) { alert('Tidak ada soal untuk topik yang dipilih.'); return; }
    var exam = {
      id: 'a' + Date.now().toString(36),
      settings: settings,
      qids: qs.map(function (q) { return q.id; }),
      orders: qs.map(optionOrder),
      answers: qs.map(function () { return null; }),
      flags: qs.map(function () { return false; }),
      cur: 0,
      start: Date.now(),
      limit: settings.timed ? qs.length * settings.secPerQ : 0
    };
    store.set('current', exam);
    store.set('lastSettings', settings);
    location.hash = '#/ujian';
  }

  function finishExam(exam) {
    var seen = store.get('seen', {});
    var qstats = store.get('qstats', {});
    var correct = 0, byTopic = {};
    exam.qids.forEach(function (id, i) {
      var q = QMAP[id];
      if (!q) return;
      var ok = exam.answers[i] === 0;
      if (ok) correct++;
      seen[id] = (seen[id] || 0) + 1;
      var s = qstats[id] || { n: 0, c: 0 };
      s.n++; if (ok) s.c++;
      qstats[id] = s;
      var bt = byTopic[q.t] || (byTopic[q.t] = { n: 0, c: 0 });
      bt.n++; if (ok) bt.c++;
    });
    var attempt = {
      id: exam.id,
      date: exam.start,
      duration: Math.round((Date.now() - exam.start) / 1000),
      settings: exam.settings,
      qids: exam.qids,
      orders: exam.orders,
      answers: exam.answers,
      flags: exam.flags,
      correct: correct,
      total: exam.qids.length,
      byTopic: byTopic
    };
    var attempts = store.get('attempts', []);
    attempts.push(attempt);
    store.set('attempts', attempts);
    store.set('seen', seen);
    store.set('qstats', qstats);
    store.set('current', null);
    location.hash = '#/hasil/' + attempt.id;
  }

  // ---------- views ----------
  var timerHandle = null;
  function clearTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  function viewHome() {
    var attempts = store.get('attempts', []);
    var last = attempts[attempts.length - 1];
    var current = store.get('current', null);
    var html = '<h1>Persiapan CBT PPDS Neurologi</h1>' +
      '<p class="muted">Try out berbobot sesuai pola soal 2023–2026, pembahasan setiap soal, dan pelacakan topik lemah.</p>';
    if (current) {
      html += '<div class="notice">Ada try out yang belum selesai. <a href="#/ujian">Lanjutkan</a></div>';
    }
    html += '<div class="grid">' +
      '<div class="card"><div class="muted small">Bank soal</div><div class="stat">' + POOL.length + '</div><div class="small muted">' + TOPICS.length + ' topik</div></div>' +
      '<div class="card"><div class="muted small">Try out selesai</div><div class="stat">' + attempts.length + '</div></div>' +
      '<div class="card"><div class="muted small">Skor terakhir</div><div class="stat">' + (last ? pct(last.correct, last.total) + '%' : '–') + '</div></div>' +
      '</div>' +
      '<div class="grid">' +
      '<a class="card tile" href="#/setup"><b>Mulai Try Out</b><span class="muted small">Simulasi campuran semua topik dengan timer.</span></a>' +
      '<a class="card tile" href="#/materi"><b>Ringkasan Materi</b><span class="muted small">High-yield per topik sesuai frekuensi soal lalu.</span></a>' +
      '<a class="card tile" href="#/progres"><b>Progres & Topik Lemah</b><span class="muted small">Riwayat skor dan penguasaan per topik.</span></a>' +
      '</div>' +
      '<p class="notice small">Soal disusun dari pengetahuan neurologi umum dan belum diverifikasi dengan Buku Ajar Neurologi FKUI. Jika ada soal yang meragukan, tekan <b>Laporkan</b> di halaman pembahasan.</p>';
    app.innerHTML = html;
  }

  function viewSetup(params) {
    var last = store.get('lastSettings', null);
    var preset = params.topic ? [params.topic] : (last ? last.topics : TOPICS.map(function (t) { return t.id; }));
    var n = last ? last.n : 50;
    var timed = last ? last.timed : true;
    var outside = last ? !!last.outside : false;
    var counts = {}, extra = {};
    POOL.forEach(function (q) { counts[q.t] = (counts[q.t] || 0) + 1; });
    OUTSIDE.forEach(function (q) { extra[q.t] = (extra[q.t] || 0) + 1; });
    var bank = params.bank || (last && last.bank) || 'buku';
    if (!PASTQ.length) bank = 'buku';
    var paper = (last && last.paper) || 'all', order = (last && last.order) || 'acak';
    var html = '<h1>Atur Try Out</h1>' +
      '<div class="card">' +
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
      '<option value="acak"' + (order === 'acak' ? ' selected' : '') + '>Acak (sesuai jumlah soal)</option>' +
      '<option value="urut"' + (order === 'urut' ? ' selected' : '') + '>Satu paket utuh, urut nomor asli</option>' +
      '</select></div></div>' +
      '<div class="field"><span>Jumlah soal</span><select id="n">' +
      [10, 25, 50, 75, 100].map(function (v) { return '<option' + (v === n ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><span>Waktu</span><select id="timed">' +
      '<option value="60"' + (timed ? ' selected' : '') + '>1 menit per soal</option>' +
      '<option value="0"' + (!timed ? ' selected' : '') + '>Tanpa batas waktu</option>' +
      '</select></div>' +
      '<div class="field"><span>Topik</span>' +
      '<div class="row small"><a href="javascript:void 0" id="all">Pilih semua</a><a href="javascript:void 0" id="none">Kosongkan</a></div>' +
      TOPICS.map(function (t) {
        return '<label class="check"><input type="checkbox" value="' + t.id + '"' + (preset.indexOf(t.id) >= 0 ? ' checked' : '') + '>' +
          '<span>' + esc(t.name) + ' <span class="muted small">(' + (counts[t.id] || 0) + ' soal' +
          (extra[t.id] ? '<span class="outside-count"' + (outside ? '' : ' hidden') + '> + ' + extra[t.id] + ' di luar buku</span>' : '') +
          ')</span></span></label>';
      }).join('') +
      '</div>' +
      '<label class="check" id="outside-wrap"' + (bank === 'lama' ? ' hidden' : '') + '><input type="checkbox" id="outside"' + (outside ? ' checked' : '') + '>' +
      '<span><b>Sertakan soal di luar Buku Ajar</b><br><span class="small muted">' + OUTSIDE.length + ' soal (terutama neuroanatomi dan serebelum) yang jawabannya tidak ditemukan di Buku Ajar Neurologi. Ditandai jelas saat pembahasan.</span></span></label>' +
      '<p class="small muted">Soal dibagi per topik sesuai bobot frekuensi soal lalu. Soal yang paling jarang Anda kerjakan diprioritaskan, sehingga setiap set berbeda.</p>' +
      '<button class="btn" id="go">Mulai</button></div>';
    app.innerHTML = html;
    var boxes = app.querySelectorAll('input[type=checkbox]:not(#outside)');
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
      var topics = [];
      boxes.forEach(function (b) { if (b.checked) topics.push(b.value); });
      if (!topics.length) { alert('Pilih minimal satu topik.'); return; }
      var sec = parseInt(document.getElementById('timed').value, 10);
      startExam({ n: parseInt(document.getElementById('n').value, 10), timed: sec > 0, secPerQ: sec || 60, topics: topics,
        outside: document.getElementById('outside').checked,
        bank: document.getElementById('bank').value,
        paper: document.getElementById('paper') ? document.getElementById('paper').value : 'all',
        order: document.getElementById('order') ? document.getElementById('order').value : 'acak' });
    };
  }

  function viewExam() {
    var exam = store.get('current', null);
    if (!exam) { location.hash = '#/setup'; return; }

    function remaining() { return exam.limit ? exam.limit - (Date.now() - exam.start) / 1000 : null; }
    function save() { store.set('current', exam); }

    function render() {
      var i = exam.cur, q = QMAP[exam.qids[i]], order = exam.orders[i];
      var answered = exam.answers.filter(function (a) { return a !== null; }).length;
      var html = '<div class="exam-head"><div><b>Soal ' + (i + 1) + '</b> <span class="muted">/ ' + exam.qids.length + '</span>' +
        ' <span class="muted small">· ' + answered + ' terjawab</span></div>' +
        '<div class="timer" id="timer"></div></div>' +
        '<div class="card"><div class="qtopic">' + esc(TOPIC[q.t].name) + '</div>' +
        '<div class="stem">' + esc(q.q) + '</div>' +
        order.map(function (oi, k) {
          return '<button class="opt' + (exam.answers[i] === oi ? ' sel' : '') + '" data-o="' + oi + '"><span class="key">' + LETTERS[k] + '.</span><span>' + esc(q.o[oi]) + '</span></button>';
        }).join('') +
        '<div class="row spread" style="margin-top:12px">' +
        '<button class="btn ghost" id="prev"' + (i === 0 ? ' disabled' : '') + '>← Sebelumnya</button>' +
        '<label class="check small"><input type="checkbox" id="flag"' + (exam.flags[i] ? ' checked' : '') + '> Ragu-ragu</label>' +
        (i < exam.qids.length - 1 ? '<button class="btn" id="next">Berikutnya →</button>' : '<button class="btn" id="submit2">Selesai</button>') +
        '</div></div>' +
        '<div class="card"><div class="row spread"><b>Navigasi soal</b><button class="btn secondary" id="submit">Selesai & lihat hasil</button></div>' +
        '<div class="nav-grid" style="margin-top:10px">' +
        exam.qids.map(function (_, k) {
          var c = (k === i ? ' cur' : '') + (exam.flags[k] ? ' flag' : exam.answers[k] !== null ? ' ans' : '');
          return '<button class="' + c + '" data-k="' + k + '">' + (k + 1) + '</button>';
        }).join('') +
        '</div><p class="small muted">Biru = terjawab, kuning = ragu-ragu.</p></div>';
      app.innerHTML = html;

      app.querySelectorAll('.opt').forEach(function (b) {
        b.onclick = function () {
          var oi = parseInt(b.getAttribute('data-o'), 10);
          exam.answers[i] = exam.answers[i] === oi ? null : oi;
          save(); render();
        };
      });
      app.querySelectorAll('.nav-grid button').forEach(function (b) {
        b.onclick = function () { exam.cur = parseInt(b.getAttribute('data-k'), 10); save(); render(); };
      });
      document.getElementById('flag').onchange = function (e) { exam.flags[i] = e.target.checked; save(); render(); };
      var prev = document.getElementById('prev');
      if (prev) prev.onclick = function () { exam.cur--; save(); render(); window.scrollTo(0, 0); };
      var next = document.getElementById('next');
      if (next) next.onclick = function () { exam.cur++; save(); render(); window.scrollTo(0, 0); };
      var submit = function () {
        var left = exam.answers.filter(function (a) { return a === null; }).length;
        var msg = left ? left + ' soal belum dijawab. Selesaikan try out?' : 'Selesaikan try out?';
        if (confirm(msg)) { clearTimer(); finishExam(exam); }
      };
      document.getElementById('submit').onclick = submit;
      var s2 = document.getElementById('submit2');
      if (s2) s2.onclick = submit;
      tick();
    }

    function tick() {
      var el = document.getElementById('timer');
      if (!el) return;
      var r = remaining();
      if (r === null) { el.textContent = '⏱ ' + fmtTime((Date.now() - exam.start) / 1000); return; }
      el.textContent = '⏱ ' + fmtTime(r);
      el.className = 'timer' + (r < 300 ? ' low' : '');
      if (r <= 0) { clearTimer(); alert('Waktu habis.'); finishExam(exam); }
    }

    clearTimer();
    timerHandle = setInterval(tick, 1000);
    render();
  }

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
    if (!a) { app.innerHTML = '<p>Hasil tidak ditemukan.</p>'; return; }
    var reported = store.get('reported', {});
    var filter = 'all';
    var p = pct(a.correct, a.total);

    function render() {
      var html = '<h1>Hasil Try Out</h1><p class="muted">' + fmtDate(a.date) + ' · durasi ' + fmtTime(a.duration) + '</p>' +
        '<div class="grid"><div class="card"><div class="muted small">Skor</div><div class="stat">' + p + '%</div><div class="small">' + a.correct + ' dari ' + a.total + ' benar</div></div>' +
        '<div class="card"><div class="muted small">Tidak dijawab</div><div class="stat">' + a.answers.filter(function (x) { return x === null; }).length + '</div></div>' +
        '<div class="card"><div class="muted small">Ditandai ragu</div><div class="stat">' + a.flags.filter(Boolean).length + '</div></div></div>' +
        '<div class="row"><button class="btn" id="again">Coba Set Lain</button><a class="btn secondary" href="#/setup">Ubah pengaturan</a></div>' +
        '<h2>Per topik</h2><div class="card">' + topicTable(a.byTopic) + '</div>' +
        '<h2>Pembahasan</h2><div class="tabs">' +
        [['all', 'Semua'], ['wrong', 'Salah/kosong'], ['flag', 'Ragu-ragu']].map(function (f) {
          return '<button data-f="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
        }).join('') + '</div>';
      a.qids.forEach(function (qid, i) {
        var q = QMAP[qid];
        if (!q) return;
        var ans = a.answers[i], ok = ans === 0;
        if (filter === 'wrong' && ok) return;
        if (filter === 'flag' && !a.flags[i]) return;
        var status = ok ? '<span class="tag ok">Benar</span>' : ans === null ? '<span class="tag warn">Tidak dijawab</span>' : '<span class="tag bad">Salah</span>';
        var pastTag = q.past ? ' · ' + esc(q.past.paper) + ' no. ' + q.past.no : '';
        html += '<div class="card"><div class="row spread"><div class="qtopic">' + (i + 1) + '. ' + esc(TOPIC[q.t].name) + pastTag + '</div>' + status + '</div>' +
          '<div class="stem">' + esc(q.q) + '</div>' +
          a.orders[i].map(function (oi, k) {
            var cls = oi === 0 ? ' correct' : (oi === ans ? ' wrong' : '');
            var mark = oi === 0 ? ' ✓' : (oi === ans ? ' ✗ (jawaban Anda)' : '');
            return '<div class="opt' + cls + '"><span class="key">' + LETTERS[k] + '.</span><span>' + esc(q.o[oi]) + '<b>' + mark + '</b></span></div>';
          }).join('') +
          '<div class="exp"><b>Pembahasan.</b> ' + esc(q.e) +
          (q.quote ? '<div class="small" style="margin-top:6px"><i>Buku Ajar: “' + esc(q.quote) + '”</i></div>' : '') +
          (q.past && q.past.agree === false ? '<div class="small" style="margin-top:6px"><span class="tag warn">Kunci di rekap soal: ' + esc(q.past.key || '-') + '</span> Jawaban di sini mengikuti ' + (q.grounded ? 'Buku Ajar' : 'literatur standar') + '.</div>' : '') + '</div>' +
          '<div class="row spread small" style="margin-top:8px">' + (q.grounded ? '<span class="muted">Sumber: ' + esc(q.src) + '</span>' : '<span class="tag warn">' + (q.past ? 'Tidak ditemukan di Buku Ajar — jawaban dari literatur standar' : 'Di luar Buku Ajar — pengetahuan umum, tidak ditemukan di buku') + '</span>') +
          '<button class="btn ghost small" data-r="' + qid + '">' + (reported[qid] ? 'Dilaporkan ✓' : 'Laporkan soal') + '</button></div></div>';
      });
      app.innerHTML = html;
      document.getElementById('again').onclick = function () { startExam(a.settings); };
      app.querySelectorAll('.tabs button').forEach(function (b) {
        b.onclick = function () { filter = b.getAttribute('data-f'); render(); };
      });
      app.querySelectorAll('[data-r]').forEach(function (b) {
        b.onclick = function () {
          var qid = b.getAttribute('data-r');
          if (reported[qid]) { delete reported[qid]; }
          else {
            var note = prompt('Apa yang salah dari soal ini? (opsional)', '');
            if (note === null) return;
            reported[qid] = { note: note, date: Date.now() };
          }
          store.set('reported', reported);
          render();
        };
      });
    }
    render();
  }

  function viewProgress() {
    var attempts = store.get('attempts', []);
    var qstats = store.get('qstats', {});
    var reported = store.get('reported', {});
    var byTopic = {};
    Object.keys(qstats).forEach(function (id) {
      var q = QMAP[id];
      if (!q) return;
      var b = byTopic[q.t] || (byTopic[q.t] = { n: 0, c: 0 });
      b.n += qstats[id].n; b.c += qstats[id].c;
    });
    var counts = {};
    POOL.forEach(function (q) { counts[q.t] = (counts[q.t] || 0) + 1; });
    var coverage = Object.keys(qstats).filter(function (id) { return QMAP[id]; }).length;

    var html = '<h1>Progres</h1>';
    if (!attempts.length) {
      app.innerHTML = html + '<div class="card">Belum ada try out. <a href="#/setup">Mulai sekarang</a>.</div>';
      return;
    }
    var weak = Object.keys(byTopic).filter(function (t) { return byTopic[t].n >= 3; })
      .sort(function (x, y) { return pct(byTopic[x].c, byTopic[x].n) - pct(byTopic[y].c, byTopic[y].n); }).slice(0, 3);
    html += '<div class="grid"><div class="card"><div class="muted small">Try out</div><div class="stat">' + attempts.length + '</div></div>' +
      '<div class="card"><div class="muted small">Soal unik dikerjakan</div><div class="stat">' + coverage + '<span class="small muted"> / ' + POOL.length + '</span></div></div>' +
      '<div class="card"><div class="muted small">Rata-rata 3 terakhir</div><div class="stat">' +
      Math.round(attempts.slice(-3).reduce(function (s, a) { return s + pct(a.correct, a.total); }, 0) / Math.min(3, attempts.length)) + '%</div></div></div>';
    if (weak.length) {
      html += '<h2>Topik terlemah</h2><div class="card">' + weak.map(function (t) {
        return '<div class="row spread" style="padding:6px 0"><span>' + esc(TOPIC[t].name) + ' — <b>' + pct(byTopic[t].c, byTopic[t].n) + '%</b></span>' +
          '<span class="row"><a href="#/materi/' + t + '">Materi</a><a class="btn secondary" href="#/setup?topic=' + t + '">Latihan topik ini</a></span></div>';
      }).join('') + '</div>';
    }
    html += '<h2>Penguasaan per topik (semua try out)</h2><div class="card">' + topicTable(byTopic) + '</div>';
    html += '<h2>Riwayat</h2><div class="card table-wrap"><table><tr><th>Tanggal</th><th>Soal</th><th>Skor</th><th></th></tr>' +
      attempts.slice().reverse().map(function (a) {
        return '<tr><td>' + fmtDate(a.date) + '</td><td>' + a.total + '</td><td>' + pct(a.correct, a.total) + '%</td><td><a href="#/hasil/' + a.id + '">Lihat</a></td></tr>';
      }).join('') + '</table></div>';
    var rep = Object.keys(reported);
    if (rep.length) {
      html += '<h2>Soal yang dilaporkan</h2><div class="card"><p class="small muted">Salin teks di bawah ini dan kirimkan untuk diperiksa.</p>' +
        '<textarea readonly style="width:100%;min-height:120px;font:inherit;font-size:.85rem">' +
        esc(rep.map(function (id) { return id + ' | ' + (QMAP[id] ? QMAP[id].q.slice(0, 80) : '?') + ' | ' + (reported[id].note || ''); }).join('\n')) +
        '</textarea></div>';
    }
    html += '<p class="small muted">Data progres tersimpan di browser perangkat ini.</p>' +
      '<button class="btn ghost small" id="reset">Hapus semua data progres</button>';
    app.innerHTML = html;
    document.getElementById('reset').onclick = function () {
      if (!confirm('Hapus semua riwayat dan progres?')) return;
      ['attempts', 'seen', 'qstats', 'current', 'reported'].forEach(function (k) { store.set(k, null); });
      viewProgress();
    };
  }

  function viewMateri(topic) {
    if (topic && MATERI[topic]) {
      var t = TOPIC[topic];
      app.innerHTML = '<p><a href="#/materi">← Semua topik</a></p><h1>' + esc(t.name) + '</h1>' +
        '<p class="muted small">Muncul ' + t.past + ' kali dalam 6 paket soal lalu (2023–2026).</p>' +
        '<div class="card materi">' + MATERI[topic] + '</div>' +
        '<a class="btn" href="#/setup?topic=' + topic + '">Latihan soal topik ini</a>';
      return;
    }
    var html = '<h1>Ringkasan Materi</h1><p class="muted">Diurutkan berdasarkan frekuensi kemunculan pada soal 2023–2026.</p>';
    var maxPast = Math.max.apply(null, TOPICS.map(function (x) { return x.past; }));
    TOPICS.forEach(function (x) {
      html += '<a class="card tile" href="#/materi/' + x.id + '"><div class="row spread"><b>' + esc(x.name) + '</b><span class="small muted">' + x.past + ' soal lalu</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(100 * x.past / maxPast) + '%"></i></div></a>';
    });
    app.innerHTML = html;
  }

  function route() {
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
    switch (path[0]) {
      case 'setup': return viewSetup(params);
      case 'ujian': return viewExam();
      case 'hasil': return viewResult(path[1]);
      case 'progres': return viewProgress();
      case 'materi': return viewMateri(path[1]);
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
