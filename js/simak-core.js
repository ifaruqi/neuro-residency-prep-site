/* Pure SIMAK selection, timing and scoring. No access to the neurology bank or storage. */
(function () {
  'use strict';
  var sections = window.SIMAK.sections;
  var sectionMap = {};
  sections.forEach(function (s) { sectionMap[s.id] = s; });

  function shuffle(list) {
    list = list.slice();
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), tmp = list[i];
      list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function optionOrder(q) {
    var order = q.o.map(function (_, i) { return i; });
    function numeric(s) {
      s = s.replace(',', '.');
      if (!/^-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?%?$/.test(s)) return NaN;
      var percent = s.endsWith('%'), pair = s.replace('%', '').split('/');
      return Number(pair[0]) / (pair[1] ? Number(pair[1]) : 1) / (percent ? 100 : 1);
    }
    if (q.o.every(function (s) { return Number.isFinite(numeric(s)); })) {
      return order.sort(function (a, b) { return numeric(q.o[a]) - numeric(q.o[b]); });
    }
    return shuffle(order);
  }

  function validate(bank) {
    var ids = {}, stems = {};
    bank.forEach(function (q) {
      var key = q.section + '|' + q.q + '|' + (q.passage ? q.passage.id : '') + '|' + JSON.stringify(q.marked || []);
      if (!/^SM-[a-f0-9]{16}$/.test(q.id) || ids[q.id]) throw new Error('ID SIMAK tidak valid/duplikat: ' + q.id);
      if (!sectionMap[q.section] || !q.q || !q.e || q.origin !== 'original' || stems[key]) throw new Error('Soal SIMAK tidak valid: ' + q.id);
      if (q.o.length < 4 || q.o.length > 5 || new Set(q.o).size !== q.o.length) throw new Error('Pilihan tidak valid: ' + q.id);
      if (q.marked && (q.marked.length !== q.o.length || q.marked.some(function (m) { return q.o[m.oi] !== m.text; }))) throw new Error('Penanda tidak valid: ' + q.id);
      if (q.passage && (!q.passage.id || !q.passage.title || !q.passage.text)) throw new Error('Bacaan tidak valid: ' + q.id);
      ids[q.id] = true; stems[key] = true;
    });
    return true;
  }

  // A shared passage/scenario is one selection unit: questions stay together and in order.
  function pick(bank, section, n, seen) {
    var units = {}, order = [];
    bank.filter(function (q) { return q.section === section; }).forEach(function (q) {
      var key = q.passage ? q.passage.id : q.id;
      if (!units[key]) { units[key] = []; order.push(key); }
      units[key].push(q);
    });
    order = shuffle(order).sort(function (a, b) {
      function exposure(k) { return units[k].reduce(function (sum, q) { return sum + (seen[q.id] || 0); }, 0) / units[k].length; }
      return exposure(a) - exposure(b);
    });
    var chosen = [], deferred = [];
    order.forEach(function (key) {
      if (chosen.length + units[key].length <= n) chosen = chosen.concat(units[key]);
      else deferred = deferred.concat(units[key]);
    });
    // A focused count may be smaller than one group; retain the passage on every selected item.
    if (chosen.length < n) chosen = chosen.concat(deferred.slice(0, n - chosen.length));
    if (chosen.length !== n) throw new Error('Jumlah soal belum mencukupi untuk subtes ini.');
    return chosen;
  }

  function create(bank, settings, seen, now) {
    var ids = settings.mode === 'full' ? sections.map(function (s) { return s.id; }) :
      settings.mode === 'peka' ? ['verbal', 'quant', 'logic'] :
      settings.mode === 'english' ? ['structure', 'reading'] : [settings.section];
    var blocks = ids.map(function (id) {
      var s = sectionMap[id];
      if (!s) throw new Error('Subtes tidak dikenal.');
      var count = settings.mode === 'focus' ? Math.min(settings.n, bank.filter(function (q) { return q.section === id; }).length) : s.n;
      if (!Number.isInteger(count) || count < 1) throw new Error('Jumlah soal tidak valid.');
      var qs = pick(bank, id, count, seen || {});
      return { section: id, questions: qs, answers: qs.map(function () { return null; }),
        flags: qs.map(function () { return false; }), revealed: qs.map(function () { return false; }),
        orders: qs.map(optionOrder),
        duration: Math.round(s.minutes * 60000 * count / s.n), endedAt: null, cur: 0 };
    });
    // Snapshots preserve historical review when the original bank changes in the future.
    blocks = JSON.parse(JSON.stringify(blocks));
    return { version: 1, id: 'SM-attempt-' + now + '-' + Math.random().toString(36).slice(2, 8),
      settings: Object.assign({}, settings, { bank: 'simak' }), start: now, blockStart: now,
      blockIndex: 0, blocks: blocks, deadline: settings.timed ? now + blocks[0].duration : null, end: null };
  }

  function advance(exam, now) {
    var block = exam.blocks[exam.blockIndex];
    block.endedAt = now;
    block.elapsed = Math.max(0, now - exam.blockStart);
    if (exam.blockIndex === exam.blocks.length - 1) { exam.end = now; return false; }
    exam.blockIndex++;
    exam.blockStart = now;
    exam.deadline = exam.settings.timed ? now + exam.blocks[exam.blockIndex].duration : null;
    return true;
  }

  function catchUp(exam, now) {
    var advanced = 0;
    while (!exam.end && exam.deadline !== null && now >= exam.deadline) {
      advance(exam, exam.deadline);
      advanced++;
    }
    return advanced;
  }

  function score(exam) {
    var totals = { PEKA: { right: 0, wrong: 0, blank: 0, points: 0, max: 0 }, English: { right: 0, wrong: 0, blank: 0, points: 0, max: 0 } };
    var rows = exam.blocks.map(function (b) {
      var s = sectionMap[b.section], row = { section: b.section, right: 0, wrong: 0, blank: 0, points: 0, max: b.questions.length * s.right };
      b.questions.forEach(function (_, i) {
        var answer = b.answers[i];
        if (answer === null || answer === undefined) row.blank++;
        else if (answer === 0) row.right++;
        else row.wrong++;
      });
      row.points = row.right * s.right + row.wrong * s.wrong;
      Object.keys(totals[s.group]).forEach(function (k) { totals[s.group][k] += row[k]; });
      return row;
    });
    return { rows: rows, totals: totals };
  }

  window.SIMAK_ENGINE = { validate: validate, create: create, pick: pick, advance: advance, catchUp: catchUp, score: score, sections: sectionMap };
})();
