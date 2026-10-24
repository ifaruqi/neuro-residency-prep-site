/* Review scheduling and validated backups. Only npx.simak.* keys may be written. */
(function(){
  'use strict';
  var DAY=86400000, intervals=[1,3,7,14,30], confidence=['yakin','ragu','tebak'];
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function studyMode(mode){return mode==='focus'||mode==='review';}
  function updateNotebook(notebook,exam,now){
    var result=clone(notebook||{});
    exam.blocks.forEach(function(b){b.questions.forEach(function(q,i){
      var correct=b.answers[i]===0, uncertain=b.flags[i]||(b.confidence&&['ragu','tebak'].indexOf(b.confidence[i])>=0), old=result[q.id];
      if(correct&&!uncertain&&!old)return;
      var item=old||{q:clone(q),note:'',reason:'',streak:0,added:now};
      var separated=!item.lastAttempt||now-item.lastAttempt>=12*3600000;
      if(!correct||uncertain){item.streak=0;item.due=now+DAY;}
      else if(separated){item.streak=Math.min(5,(item.streak||0)+1);item.due=now+intervals[Math.max(0,item.streak-1)]*DAY;}
      // An immediate successful retry cannot postpone an already-due review.
      item.lastOutcome=!correct?(b.answers[i]===null?'blank':'wrong'):uncertain?'uncertain':'correct';
      item.lastAttempt=now;item.updatedAt=now;item.q=clone(q);result[q.id]=item;
    });});
    return result;
  }
  function queue(notebook,filter,now){
    return Object.keys(notebook||{}).map(function(id){return notebook[id];}).filter(function(item){
      return filter==='all'||filter==='wrong'&&['wrong','blank'].indexOf(item.lastOutcome)>=0||filter==='uncertain'&&item.lastOutcome==='uncertain'||filter==='due'&&item.due<=now;
    }).sort(function(a,b){return a.due-b.due||a.added-b.added;});
  }
  function pacing(exam){
    var result={observed:0,active:0,slowCorrect:0,fastWrong:0,rows:[]};
    exam.blocks.forEach(function(b){var section=window.SIMAK_ENGINE.sections[b.section],ref=section.minutes*60000/section.n;
      b.questions.forEach(function(q,i){var spent=b.spent&&b.spent[i]||0;if(spent<=0)return;
        var slow=b.answers[i]===0&&spent>ref*1.5,fast=b.answers[i]!==null&&b.answers[i]!==0&&spent<ref*.5;
        result.observed++;result.active+=spent;if(slow)result.slowCorrect++;if(fast)result.fastWrong++;
        result.rows.push({id:q.id,section:b.section,spent:spent,reference:ref,slowCorrect:slow,fastWrong:fast});
      });
    });return result;
  }
  function fail(message){throw new Error('Cadangan tidak valid: '+message);}
  function finite(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
  function object(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
  function safeQuestion(q){
    if(!object(q)||typeof q.q!=='string'||q.q.length>20000||typeof q.skill!=='string'||q.skill.length>300||typeof q.e!=='string'||q.e.length>20000||!Array.isArray(q.o)||q.o.some(function(o){return typeof o!=='string'||o.length>5000;}))fail('bentuk soal');
    if(q.passage&&(!object(q.passage)||typeof q.passage.text!=='string'||q.passage.text.length>100000||typeof q.passage.title!=='string'))fail('bacaan');
    if(q.figure){var f=q.figure;if(!object(f)||!window.SIMAK_FIGURES||window.SIMAK_FIGURES.kinds.indexOf(f.kind)<0||typeof f.alt!=='string'||f.alt.length>10000)fail('diagram');
      if(f.labels!==undefined&&(!object(f.labels)||Object.keys(f.labels).some(function(k){return ['string','number'].indexOf(typeof f.labels[k])<0;})))fail('label diagram');
      if(f.kind==='arrowSeries'&&(!Array.isArray(f.angles)||f.angles.length!==4||f.angles.some(function(n){return !finite(n)||n>360;})))fail('arah diagram');
      if(f.kind==='numberCross'&&(!Array.isArray(f.values)||f.values.length!==3||f.values.some(function(row){return !Array.isArray(row)||row.length!==5||row.some(function(v){return v!=='?'&&(!finite(v)||v>100000);});})))fail('salib angka');
      if(f.kind==='barChart'&&(!Array.isArray(f.categories)||f.categories.length!==4||f.categories.some(function(v){return typeof v!=='string'||v.length>30;})||!Array.isArray(f.series)||f.series.length!==2||f.series.some(function(row){return !object(row)||typeof row.name!=='string'||row.name.length>30||!Array.isArray(row.values)||row.values.length!==4||row.values.some(function(v){return !finite(v)||v>100000;});})))fail('diagram batang');
      if(f.kind==='dotMatrix'&&(!Array.isArray(f.values)||f.values.length!==3||f.values.some(function(row){return !Array.isArray(row)||row.length!==3||row.some(function(n){return n!==null&&(!Number.isInteger(n)||n<0||n>20);});})))fail('matriks diagram');
    }
    if(q.marked&&(!Array.isArray(q.marked)||q.marked.some(function(m){return !object(m)||typeof m.text!=='string'||!Number.isInteger(m.oi)||m.oi<0||m.oi>=q.o.length;})||new Set(q.marked.map(function(m){return m.oi;})).size!==q.o.length))fail('penanda pilihan');
    if(q.table){if(!object(q.table)||!Array.isArray(q.table.columns)||!Array.isArray(q.table.rows)||q.table.columns.length>20||q.table.rows.length>100)fail('tabel');
      if(q.table.columns.some(function(c){return typeof c!=='string';})||q.table.rows.some(function(row){return !Array.isArray(row)||row.length!==q.table.columns.length||row.some(function(c){return typeof c!=='string';});}))fail('isi tabel');}
    if(q.segments){if(!q.marked||!Array.isArray(q.segments)||q.segments.length>100||q.segments.some(function(p){return typeof p==='string'?p.length>10000:!object(p)||typeof p.text!=='string'||!Number.isInteger(p.oi)||!q.marked.some(function(m){return m.oi===p.oi&&m.text===p.text;});}))fail('konteks bagian bergaris bawah');var markedSegments=q.segments.filter(function(p){return typeof p!=='string';});if(markedSegments.length!==q.o.length||new Set(markedSegments.map(function(p){return p.oi;})).size!==q.o.length)fail('jumlah bagian bergaris bawah');}
    if(q.solution){if(!object(q.solution))fail('pembahasan');['shortcut','trap','rule','evidence'].forEach(function(k){if(q.solution[k]!==undefined&&typeof q.solution[k]!=='string')fail('teks pembahasan');});if(q.solution.steps&&(!Array.isArray(q.solution.steps)||q.solution.steps.some(function(s){return typeof s!=='string';})))fail('langkah pembahasan');}
    if(q.difficulty!==undefined&&['foundation','standard','challenge'].indexOf(q.difficulty)<0)fail('tingkat soal');
    window.SIMAK_ENGINE.validate([q]);
    return q;
  }
  function normalizeExam(exam,complete){
    if(!object(exam)||!/^SM-attempt-[a-zA-Z0-9-]+$/.test(exam.id)||!object(exam.settings)||exam.settings.bank!=='simak'||['full','peka','english','focus','review'].indexOf(exam.settings.mode)<0||typeof exam.settings.timed!=='boolean'||!finite(exam.start)||!finite(exam.blockStart)||!Array.isArray(exam.blocks)||!exam.blocks.length||exam.blocks.length>5)fail('sesi');
    if(!Number.isInteger(exam.blockIndex)||exam.blockIndex<0||exam.blockIndex>=exam.blocks.length||!(exam.deadline===null||finite(exam.deadline))||!(exam.end===null||finite(exam.end))||complete&&exam.end===null)fail('waktu sesi');
    if(exam.settings.packageId!==undefined&&['A','B','C','mixed'].indexOf(exam.settings.packageId)<0||exam.settings.skill!==undefined&&(typeof exam.settings.skill!=='string'||exam.settings.skill.length>300))fail('paket atau keterampilan');
    if(exam.settings.sessionMode===undefined)exam.settings.sessionMode='exam';
    if(exam.settings.difficulty===undefined)exam.settings.difficulty='mixed';
    if(['exam','flexible'].indexOf(exam.settings.sessionMode)<0||['mixed','foundation','standard','challenge'].indexOf(exam.settings.difficulty)<0)fail('mode sesi atau tingkat kesulitan');
    if(exam.status===undefined)exam.status=exam.end===null?'active':'complete';
    if(['active','paused','break','complete'].indexOf(exam.status)<0||((exam.status==='complete')!==(exam.end!==null)))fail('status sesi');
    if(exam.status==='paused'||exam.status==='break'){
      if(exam.settings.sessionMode!=='flexible'||exam.deadline!==null)fail('jeda sesi');
      if(exam.status==='paused'&&(!finite(exam.pausedAt)||exam.pausedAt<exam.blockStart||(exam.settings.timed?!finite(exam.remainingMs):exam.remainingMs!==null)))fail('sisa waktu jeda');
      if(exam.status==='break'&&(exam.blockIndex===0||!finite(exam.breakAt)))fail('istirahat antar-subtes');
    }else if(exam.status==='active'&&exam.settings.timed&&exam.deadline===null)fail('timer aktif');
    if(exam.settings.format!==undefined&&['reference','general'].indexOf(exam.settings.format)<0)fail('format sesi');
    var ids={};
    exam.blocks.forEach(function(b){
      if(!object(b)||!window.SIMAK_ENGINE.sections[b.section]||!Array.isArray(b.questions)||!b.questions.length||b.questions.length>1000||!finite(b.duration)||!Number.isInteger(b.cur)||b.cur<0||b.cur>=b.questions.length)fail('subtes');
      ['answers','orders','flags'].forEach(function(k){if(!Array.isArray(b[k])||b[k].length!==b.questions.length)fail('jawaban atau urutan');});
      b.questions.forEach(function(q,i){safeQuestion(q);if(q.section!==b.section||ids[q.id])fail('identitas soal');ids[q.id]=true;
        if(b.answers[i]!==null&&(!Number.isInteger(b.answers[i])||b.answers[i]<0||b.answers[i]>=q.o.length))fail('indeks jawaban');
        if(typeof b.flags[i]!=='boolean'||!Array.isArray(b.orders[i])||b.orders[i].length!==q.o.length||new Set(b.orders[i]).size!==q.o.length||b.orders[i].some(function(o){return !Number.isInteger(o)||o<0||o>=q.o.length;}))fail('urutan pilihan');
      });
      if(b.revealed===undefined)b.revealed=b.questions.map(function(){return false;});
      if(b.spent===undefined)b.spent=b.questions.map(function(){return 0;});
      if(b.confidence===undefined)b.confidence=b.questions.map(function(){return null;});
      ['revealed','spent','confidence'].forEach(function(k){if(!Array.isArray(b[k])||b[k].length!==b.questions.length)fail('metadata jawaban');});
      if(b.revealed.some(function(x){return typeof x!=='boolean';})||b.spent.some(function(x){return !finite(x);})||b.confidence.some(function(x){return x!==null&&confidence.indexOf(x)<0;}))fail('metadata waktu atau keyakinan');
      if(b.elapsed!==undefined&&!finite(b.elapsed)||b.pauseMs!==undefined&&!finite(b.pauseMs))fail('durasi');
      if(exam.status==='paused'&&b===exam.blocks[exam.blockIndex]&&exam.remainingMs>b.duration)fail('sisa waktu melebihi durasi');
    });
    if(exam.status==='break'&&(!finite(exam.blocks[exam.blockIndex-1].endedAt)||exam.blocks[exam.blockIndex].endedAt!==null))fail('urutan istirahat');
    if(exam.status==='paused'&&exam.blocks[exam.blockIndex].endedAt!==null)fail('subtes jeda sudah selesai');
    if(complete)exam.score=window.SIMAK_ENGINE.score(exam);
    return exam;
  }
  function validateBackup(value){
    if(!object(value)||['simak-backup-v1','simak-backup-v2'].indexOf(value.schema)<0||!finite(value.date)||!Array.isArray(value.attempts)||value.attempts.length>1000)fail('format berkas');
    var backup=clone(value),seenIds={};
    backup.attempts.forEach(function(a){normalizeExam(a,true);if(seenIds[a.id])fail('sesi duplikat');seenIds[a.id]=true;});
    if(backup.current!==null&&backup.current!==undefined)normalizeExam(backup.current,false);else backup.current=null;
    if(backup.reported===undefined)backup.reported={};if(!object(backup.reported))fail('laporan soal');
    Object.keys(backup.reported).forEach(function(id){if(!/^SM-[a-f0-9]{16}$/.test(id)||!object(backup.reported[id]))fail('identitas laporan');});
    if(backup.notebook===undefined){backup.notebook={};backup.attempts.slice().sort(function(a,b){return a.start-b.start;}).forEach(function(a){backup.notebook=updateNotebook(backup.notebook,a,a.end);});}if(!object(backup.notebook))fail('buku kesalahan');
    Object.keys(backup.notebook).forEach(function(id){var n=backup.notebook[id];if(!object(n)||!n.q||n.q.id!==id||!finite(n.due)||!finite(n.added)||!finite(n.lastAttempt)||!finite(n.updatedAt)||!Number.isInteger(n.streak)||n.streak<0||n.streak>5||['correct','wrong','blank','uncertain'].indexOf(n.lastOutcome)<0||typeof n.note!=='string'||n.note.length>5000||typeof n.reason!=='string'||n.reason.length>100)fail('catatan ulasan');safeQuestion(n.q);});
    return backup;
  }
  function mergeBackup(local,backup,replace){
    var byId={},notebook=replace?{}:clone(local.notebook||{}),reported=replace?{}:clone(local.reported||{});
    if(!replace)(local.attempts||[]).forEach(function(a){byId[a.id]=a;});
    backup.attempts.forEach(function(a){if(!byId[a.id])byId[a.id]=a;});
    var attempts=Object.keys(byId).map(function(k){return byId[k];}).sort(function(a,b){return a.start-b.start;});
    Object.keys(backup.notebook).forEach(function(id){if(!notebook[id]||(backup.notebook[id].updatedAt||0)>(notebook[id].updatedAt||0))notebook[id]=backup.notebook[id];});
    Object.keys(backup.reported).forEach(function(id){if(!reported[id])reported[id]=backup.reported[id];});
    var seen={};attempts.forEach(function(a){a.blocks.forEach(function(b){b.questions.forEach(function(q){seen[q.id]=(seen[q.id]||0)+1;});});});
    return {attempts:attempts,current:replace?backup.current:(local.current||backup.current),notebook:notebook,reported:reported,seen:seen};
  }
  function persist(storage,values){
    var keys=Object.keys(values),previous={};keys.forEach(function(k){previous[k]=storage.getItem('npx.simak.'+k);});
    try{keys.forEach(function(k){storage.setItem('npx.simak.'+k,JSON.stringify(values[k]));});}
    catch(error){
      // Free partially imported space before restoring the exact earlier values.
      keys.forEach(function(k){try{storage.removeItem('npx.simak.'+k);}catch(_){}});
      keys.forEach(function(k){try{if(previous[k]!==null)storage.setItem('npx.simak.'+k,previous[k]);}catch(_){}});
      throw new Error('Impor gagal; ruang penyimpanan tidak cukup atau tidak tersedia. Progres sebelumnya dipertahankan sejauh penyimpanan mengizinkan.');
    }
  }
  window.SIMAK_STUDY={updateNotebook:updateNotebook,queue:queue,pacing:pacing,validateBackup:validateBackup,normalizeExam:normalizeExam,mergeBackup:mergeBackup,persist:persist,studyMode:studyMode};
})();
