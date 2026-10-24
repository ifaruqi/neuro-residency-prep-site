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

  function presentationOrder(q) { return q.marked ? q.marked.map(function(m){return m.oi;}) : optionOrder(q); }

  function validate(bank) {
    var ids = {}, stems = {};
    bank.forEach(function (q) {
      var key = q.section + '|' + q.q + '|' + (q.passage ? q.passage.id : '') + '|' + (q.table ? q.table.id : '') + '|' + JSON.stringify(q.figure || {}) + '|' + JSON.stringify(q.marked || []) + '|' + JSON.stringify(q.segments || []);
      if (!/^SM-[a-f0-9]{16}$/.test(q.id) || ids[q.id]) throw new Error('ID SIMAK tidak valid/duplikat: ' + q.id);
      if (!sectionMap[q.section] || !q.q || !q.e || q.origin !== 'original' || stems[key]) throw new Error('Soal SIMAK tidak valid: ' + q.id);
      if (q.difficulty !== undefined && ['foundation','standard','challenge'].indexOf(q.difficulty)<0) throw new Error('Tingkat soal tidak valid: '+q.id);
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
      var key = q.passage ? q.passage.id : q.table ? q.table.id : q.id;
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

  function referencePick(bank, section, seen) {
    function select(pool,n){return pick(pool,section,n,seen);}
    function groups(pool,n,perGroup){
      var units={};pool.forEach(function(q){if(q.passage)(units[q.passage.id]||(units[q.passage.id]=[])).push(q);});
      var eligible=Object.keys(units).filter(function(id){return units[id].length>=perGroup;});
      eligible=shuffle(eligible).sort(function(a,b){
        function exposure(id){return units[id].reduce(function(sum,q){return sum+(seen[q.id]||0);},0)/units[id].length;}
        return exposure(a)-exposure(b);
      });
      if(eligible.length<n)throw new Error('Kumpulan bacaan untuk format acuan belum cukup.');
      return eligible.slice(0,n).reduce(function(all,id){return all.concat(units[id].slice(0,perGroup));},[]);
    }
    var pool=bank.filter(function(q){return q.section===section;});
    if(section==='verbal')return select(pool.filter(function(q){return q.skill==='Analogi'&&!q.passage;}),28).concat(groups(pool.filter(function(q){return q.passage;}),3,4));
    if(section==='structure')return select(pool.filter(function(q){return !q.marked&&q.o.length===4;}),15).concat(select(pool.filter(function(q){return q.marked&&q.o.length===4;}),25));
    if(section==='reading')return groups(pool.filter(function(q){return q.style==='reference'&&q.o.length===4;}),5,10);
    if(section==='logic')return select(pool.filter(function(q){return !q.passage&&q.skill!=='Pola visual';}),15).concat(groups(pool.filter(function(q){return q.passage;}),2,5));
    return select(pool,35);
  }

  function create(bank, settings, seen, now) {
    bank = bank.filter(function(q){return (!settings.difficulty||settings.difficulty==='mixed'||q.difficulty===settings.difficulty)&&(!settings.packageId||settings.packageId==='mixed'||q.package===settings.packageId)&&(!settings.skill||q.skill===settings.skill);});
    var ids = settings.mode === 'full' ? sections.map(function (s) { return s.id; }) :
      settings.mode === 'peka' ? ['verbal', 'quant', 'logic'] :
      settings.mode === 'english' ? ['structure', 'reading'] : [settings.section];
    var blocks = ids.map(function (id) {
      var s = sectionMap[id];
      if (!s) throw new Error('Subtes tidak dikenal.');
      var count = settings.mode === 'focus' ? Math.min(settings.n, bank.filter(function (q) { return q.section === id; }).length) : s.n;
      if (!Number.isInteger(count) || count < 1) throw new Error('Jumlah soal tidak valid.');
      var qs = settings.format==='reference'&&settings.mode!=='focus'?referencePick(bank,id,seen||{}):pick(bank,id,count,seen||{});
      return { section: id, questions: qs, answers: qs.map(function () { return null; }),
        flags: qs.map(function () { return false; }), revealed: qs.map(function () { return false; }),
        spent: qs.map(function(){return 0;}), confidence: qs.map(function(){return null;}),
        orders: qs.map(presentationOrder),
        duration: Math.round(s.minutes * 60000 * count / s.n), endedAt: null, cur: 0 };
    });
    // Snapshots preserve historical review when the original bank changes in the future.
    blocks = JSON.parse(JSON.stringify(blocks));
    return { version: 1, id: 'SM-attempt-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'active', settings: Object.assign({sessionMode:'exam',difficulty:'mixed'}, settings, { bank: 'simak' }), start: now, blockStart: now,
      blockIndex: 0, blocks: blocks, deadline: settings.timed ? now + blocks[0].duration : null, end: null };
  }

  function createReview(items, n, now) {
    var questions=items.slice(0,n).map(function(item){return item.q;}),blocks=[];
    if(!questions.length)throw new Error('Tidak ada soal pada daftar ulasan ini.');
    sections.forEach(function(s){var qs=questions.filter(function(q){return q.section===s.id;});if(!qs.length)return;
      blocks.push({section:s.id,questions:qs,answers:qs.map(function(){return null;}),flags:qs.map(function(){return false;}),revealed:qs.map(function(){return false;}),spent:qs.map(function(){return 0;}),confidence:qs.map(function(){return null;}),orders:qs.map(presentationOrder),duration:Math.round(s.minutes*60000*qs.length/s.n),endedAt:null,cur:0});
    });
    return {version:1,id:'SM-attempt-'+now+'-'+Math.random().toString(36).slice(2,8),status:'active',settings:{bank:'simak',mode:'review',timed:false,sessionMode:'flexible',difficulty:'mixed'},start:now,blockStart:now,blockIndex:0,blocks:JSON.parse(JSON.stringify(blocks)),deadline:null,end:null};
  }

  function active(exam) { return !exam.end && (!exam.status || exam.status === 'active'); }
  function advance(exam, now) {
    if (!active(exam)) return false;
    var block = exam.blocks[exam.blockIndex];
    block.endedAt = now;
    block.elapsed = Math.max(0, now - exam.blockStart - (block.pauseMs || 0));
    if (exam.blockIndex === exam.blocks.length - 1) { exam.end = now; exam.status = 'complete'; exam.deadline = null; return false; }
    exam.blockIndex++;
    exam.blockStart = now;
    if (exam.settings.sessionMode === 'flexible') {
      exam.status = 'break'; exam.deadline = null; exam.breakAt = now;
    } else {
      exam.status = 'active';
      exam.deadline = exam.settings.timed ? now + exam.blocks[exam.blockIndex].duration : null;
    }
    return true;
  }
  function catchUp(exam, now) {
    var advanced = 0;
    while (active(exam) && exam.deadline !== null && now >= exam.deadline) {
      advance(exam, exam.deadline); advanced++;
    }
    return advanced;
  }
  function pause(exam, now) {
    catchUp(exam, now);
    if (!active(exam) || exam.settings.sessionMode !== 'flexible') return false;
    exam.remainingMs = exam.settings.timed ? Math.max(0, exam.deadline - now) : null;
    exam.pausedAt = now; exam.status = 'paused'; exam.deadline = null;
    exam.pauseCount = (exam.pauseCount || 0) + 1;
    return true;
  }
  function resume(exam, now) {
    if (exam.end || exam.settings.sessionMode !== 'flexible') return false;
    var block = exam.blocks[exam.blockIndex];
    if (exam.status === 'paused') {
      block.pauseMs = (block.pauseMs || 0) + Math.max(0, now - exam.pausedAt);
      exam.deadline = exam.settings.timed ? now + exam.remainingMs : null;
      delete exam.pausedAt; delete exam.remainingMs;
    } else if (exam.status === 'break') {
      exam.blockStart = now;
      exam.deadline = exam.settings.timed ? now + block.duration : null;
      delete exam.breakAt;
    } else return false;
    exam.status = 'active'; return true;
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

  window.SIMAK_ENGINE = { validate: validate, create: create, createReview:createReview, pick: pick, referencePick:referencePick, advance: advance, catchUp: catchUp, pause:pause, resume:resume, active:active, score: score, sections: sectionMap };
})();
